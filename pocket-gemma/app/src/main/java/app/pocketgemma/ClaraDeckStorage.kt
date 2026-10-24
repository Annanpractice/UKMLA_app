package app.pocketgemma

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.util.JsonReader
import android.util.JsonToken
import java.io.File
import java.io.Reader
import java.io.PushbackReader
import java.util.UUID

/**
 * Large decks are stored as rows on disk rather than a giant in-memory JSON
 * object. Only id, topic and progress are loaded for filters. The currently
 * visible card (including data-URI images) is retrieved on demand.
 *
 * Imports stream from Android's document provider and stage into a separate
 * SQLite database. A malformed/import-interrupted file never overwrites the
 * current working deck. There is no artificial total-byte or card-count cap.
 */
object ClaraDeckStorage {
    private const val DATABASE = "clara-flashcards.sqlite"
    private const val STAGING = "clara-flashcards-importing.sqlite"
    private const val BACKUP = "clara-flashcards-backup.sqlite"
    private const val LEGACY = "clara-flashcards.json"

    private fun primary(context: Context) = File(context.filesDir, DATABASE)

    fun load(context: Context): ClaraStudyDeck {
        val file = primary(context)
        if (!file.isFile) {
            val legacy = File(context.filesDir, LEGACY)
            if (legacy.isFile) {
                // Migrate previously imported decks using a streaming parser.
                // Leave the original JSON intact as a recovery copy.
                runCatching {
                    legacy.bufferedReader(Charsets.UTF_8).use { importReader(context, it) }
                }
            }
        }
        if (!file.isFile) return ClaraStudyDeck()
        return SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            val result = ArrayList<ClaraStudyCard>()
            db.rawQuery("SELECT id, topic, status FROM cards ORDER BY position ASC", null).use { cursor ->
                while (cursor.moveToNext()) {
                    result.add(ClaraStudyCard(
                        id = cursor.getString(0),
                        question = "",
                        answer = "",
                        topic = cursor.getString(1) ?: "",
                        status = cursor.getString(2) ?: "remaining"
                    ))
                }
            }
            ClaraStudyDeck(result)
        }
    }

    fun importLocal(context: Context, uri: Uri): ClaraStudyDeck {
        val input = context.contentResolver.openInputStream(uri)
            ?: error("Android could not open the selected JSON file.")
        return input.bufferedReader(Charsets.UTF_8).use { importReader(context, it) }
    }

    private fun importReader(context: Context, source: Reader): ClaraStudyDeck {
        val target = primary(context)
        val staging = File(context.filesDir, STAGING)
        val backup = File(context.filesDir, BACKUP)
        if (staging.exists()) staging.delete()
        if (backup.exists()) backup.delete()

        var database: SQLiteDatabase? = null
        var count = 0L
        try {
            val db = SQLiteDatabase.openOrCreateDatabase(staging, null)
            database = db
            db.execSQL("CREATE TABLE cards (" +
                "id TEXT PRIMARY KEY, position INTEGER NOT NULL, q TEXT NOT NULL, a TEXT NOT NULL, " +
                "topic TEXT NOT NULL, qimg TEXT NOT NULL, aimg TEXT NOT NULL, status TEXT NOT NULL)")
            db.execSQL("CREATE INDEX cards_topic_status ON cards(topic, status)")
            db.beginTransaction()

            fun readValue(reader: JsonReader): String = when (reader.peek()) {
                JsonToken.STRING, JsonToken.NUMBER -> reader.nextString()
                JsonToken.BOOLEAN -> reader.nextBoolean().toString()
                JsonToken.NULL -> { reader.nextNull(); "" }
                else -> { reader.skipValue(); "" }
            }

            fun card(reader: JsonReader, category: String) {
                if (reader.peek() != JsonToken.BEGIN_OBJECT) {
                    reader.skipValue()
                    return
                }
                var id = ""
                var q = ""
                var a = ""
                var topic = ""
                var qImg = ""
                var aImg = ""
                var status = category
                reader.beginObject()
                while (reader.hasNext()) {
                    when (reader.nextName().lowercase()) {
                        "id" -> id = readValue(reader)
                        "q", "question", "front", "prompt" -> {
                            val text = readValue(reader)
                            if (q.isBlank()) q = text
                        }
                        "a", "answer", "back", "response" -> {
                            val text = readValue(reader)
                            if (a.isBlank()) a = text
                        }
                        "topic", "subject" -> topic = readValue(reader)
                        "qimg", "qimage" -> qImg = readValue(reader)
                        "aimg", "aimage" -> aImg = readValue(reader)
                        "status" -> {
                            val declared = readValue(reader)
                            if (category == "remaining") status = declared
                        }
                        else -> reader.skipValue()
                    }
                }
                reader.endObject()
                if (q.isBlank() && a.isBlank() && qImg.isBlank() && aImg.isBlank()) return
                if (status !in listOf("remaining", "understood", "mastered")) status = "remaining"

                val values = ContentValues().apply {
                    put("id", id.ifBlank { UUID.randomUUID().toString() })
                    put("position", count)
                    put("q", q)
                    put("a", a)
                    put("topic", topic)
                    put("qimg", qImg)
                    put("aimg", aImg)
                    put("status", status)
                }
                val inserted = db.insertWithOnConflict("cards", null, values, SQLiteDatabase.CONFLICT_IGNORE)
                if (inserted < 0) {
                    values.put("id", UUID.randomUUID().toString())
                    db.insertOrThrow("cards", null, values)
                }
                count++
                // Small transactions prevent an enormous rollback journal for
                // image-heavy JSON files; incomplete staging is discarded.
                if (count % 200L == 0L) {
                    db.setTransactionSuccessful()
                    db.endTransaction()
                    db.beginTransaction()
                }
            }

            fun array(reader: JsonReader, category: String) {
                if (reader.peek() != JsonToken.BEGIN_ARRAY) {
                    reader.skipValue()
                    return
                }
                reader.beginArray()
                while (reader.hasNext()) card(reader, category)
                reader.endArray()
            }

            // Android JsonReader accepts a UTF-8 reader; strip optional BOM.
            val input = PushbackReader(source, 1)
            val first = input.read()
            if (first >= 0 && first != 0xFEFF) input.unread(first)
            JsonReader(input).use { reader ->
                when (reader.peek()) {
                    JsonToken.BEGIN_ARRAY -> array(reader, "remaining")
                    JsonToken.BEGIN_OBJECT -> {
                        reader.beginObject()
                        while (reader.hasNext()) {
                            when (reader.nextName().lowercase()) {
                                "cards", "flashcards", "items", "questions" -> array(reader, "remaining")
                                "understood", "seen", "learned" -> array(reader, "understood")
                                "mastered" -> array(reader, "mastered")
                                else -> reader.skipValue()
                            }
                        }
                        reader.endObject()
                    }
                    else -> error("The selected file is not a JSON flashcard deck.")
                }
            }
            db.setTransactionSuccessful()
            db.endTransaction()
            db.close()
            database = null
            require(count > 0) {
                "No flashcards found. Select a JSON deck with a cards, flashcards, or items array."
            }

            // Swap the completed database into place only after validation.
            if (target.exists()) require(target.renameTo(backup)) {
                "Could not preserve your existing cards before importing."
            }
            if (!staging.renameTo(target)) {
                if (backup.exists()) backup.renameTo(target)
                error("Could not save the imported deck. Check available device storage.")
            }
            if (backup.exists()) backup.delete()
            return load(context)
        } catch (failure: Exception) {
            runCatching { database?.close() }
            if (staging.exists()) staging.delete()
            throw failure
        }
    }

    fun readCard(context: Context, id: String): ClaraStudyCard? {
        val dbFile = primary(context)
        if (!dbFile.isFile) return null
        return SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            db.rawQuery("SELECT id, q, a, topic, qimg, aimg, status FROM cards WHERE id = ? LIMIT 1", arrayOf(id))
                .use { cursor ->
                    if (!cursor.moveToFirst()) null
                    else ClaraStudyCard(
                        id = cursor.getString(0),
                        question = cursor.getString(1) ?: "",
                        answer = cursor.getString(2) ?: "",
                        topic = cursor.getString(3) ?: "",
                        qImage = cursor.getString(4) ?: "",
                        aImage = cursor.getString(5) ?: "",
                        status = cursor.getString(6) ?: "remaining"
                    )
                }
        }
    }

    fun updateStatus(context: Context, id: String, status: String) {
        require(status in listOf("remaining", "understood", "mastered"))
        val file = primary(context)
        require(file.isFile) { "No flashcard deck is loaded." }
        SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
            val values = ContentValues().apply { put("status", status) }
            check(db.update("cards", values, "id = ?", arrayOf(id)) == 1) {
                "The selected flashcard could not be found."
            }
        }
    }
}
