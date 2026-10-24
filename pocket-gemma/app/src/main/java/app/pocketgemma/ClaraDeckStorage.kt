package app.pocketgemma

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.util.JsonWriter
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
            db.rawQuery("SELECT id, topic, status FROM cards WHERE status != 'deleted' ORDER BY position ASC", null).use { cursor ->
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
                "topic TEXT NOT NULL, qimg TEXT NOT NULL, aimg TEXT NOT NULL, color TEXT NOT NULL, status TEXT NOT NULL)")
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
                var color = "#f7f9ff"
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
                        "color", "colour" -> color = readValue(reader)
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
                    put("color", color.takeIf { it.matches(Regex("#[0-9A-Fa-f]{6}")) } ?: "#f7f9ff")
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
            val hasColor = db.rawQuery("PRAGMA table_info(cards)", null).use { c ->
                var present = false
                while (c.moveToNext()) if (c.getString(1) == "color") present = true
                present
            }
            val query = if (hasColor) "SELECT id, q, a, topic, qimg, aimg, status, color FROM cards WHERE id = ? LIMIT 1"
                else "SELECT id, q, a, topic, qimg, aimg, status FROM cards WHERE id = ? LIMIT 1"
            db.rawQuery(query, arrayOf(id))
                .use { cursor ->
                    if (!cursor.moveToFirst()) null
                    else ClaraStudyCard(
                        id = cursor.getString(0),
                        question = cursor.getString(1) ?: "",
                        answer = cursor.getString(2) ?: "",
                        topic = cursor.getString(3) ?: "",
                        qImage = cursor.getString(4) ?: "",
                        aImage = cursor.getString(5) ?: "",
                        color = if (hasColor) cursor.getString(7) ?: "#f7f9ff" else "#f7f9ff",
                        status = cursor.getString(6) ?: "remaining"
                    )
                }
        }
    }

    private fun addColorIfNeeded(db: SQLiteDatabase) {
        val exists = db.rawQuery("PRAGMA table_info(cards)", null).use { c ->
            var found = false
            while (c.moveToNext()) if (c.getString(1) == "color") found = true
            found
        }
        if (!exists) db.execSQL("ALTER TABLE cards ADD COLUMN color TEXT NOT NULL DEFAULT '#f7f9ff'")
    }

    // Add/edit a card while preserving its images and original rich HTML.
    fun saveCard(context: Context, card: ClaraStudyCard) {
        val file = primary(context)
        if (!file.exists()) {
            SQLiteDatabase.openOrCreateDatabase(file, null).use { db ->
                db.execSQL("CREATE TABLE cards (" +
                    "id TEXT PRIMARY KEY, position INTEGER NOT NULL, q TEXT NOT NULL, a TEXT NOT NULL, " +
                    "topic TEXT NOT NULL, qimg TEXT NOT NULL, aimg TEXT NOT NULL, color TEXT NOT NULL, status TEXT NOT NULL)")
                db.execSQL("CREATE INDEX cards_topic_status ON cards(topic, status)")
            }
        }
        SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
            addColorIfNeeded(db)
            val position = db.rawQuery("SELECT position FROM cards WHERE id = ?", arrayOf(card.id)).use { c ->
                if (c.moveToFirst()) c.getLong(0)
                else db.rawQuery("SELECT COALESCE(MAX(position), -1) + 1 FROM cards", null).use { it.moveToFirst(); it.getLong(0) }
            }
            val values = ContentValues().apply {
                put("id", card.id)
                put("position", position)
                put("q", card.question)
                put("a", card.answer)
                put("topic", card.topic)
                put("qimg", card.qImage)
                put("aimg", card.aImage)
                put("color", card.color)
                put("status", card.status)
            }
            db.insertWithOnConflict("cards", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }

    // Soft-delete is reversible; it avoids copying image-heavy card content
    // into Compose memory merely to support Undo.
    fun deleteCard(context: Context, id: String) {
        val file = primary(context)
        SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
            db.execSQL("UPDATE cards SET status = 'deleted' WHERE id = ?", arrayOf(id))
        }
    }

    fun searchIds(context: Context, term: String): Set<String> {
        if (term.isBlank()) return emptySet()
        val file = primary(context)
        if (!file.exists()) return emptySet()
        SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            val pattern = "%${term.trim()}%"
            return db.rawQuery(
                "SELECT id FROM cards WHERE status != 'deleted' AND (q LIKE ? OR a LIKE ? OR topic LIKE ?)",
                arrayOf(pattern, pattern, pattern)
            ).use { c ->
                buildSet {
                    while (c.moveToNext()) add(c.getString(0))
                }
            }
        }
    }

    // Stream the full original-compatible format without serialising the deck
    // into one giant String or holding images for every card in memory.
    fun exportJson(context: Context, uri: Uri) {
        val file = primary(context)
        require(file.exists()) { "Import a deck before exporting." }
        val output = context.contentResolver.openOutputStream(uri) ?: error("Unable to write destination")
        SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            val hasColor = db.rawQuery("PRAGMA table_info(cards)", null).use { c ->
                var found = false
                while (c.moveToNext()) if (c.getString(1) == "color") found = true
                found
            }
            JsonWriter(output.bufferedWriter(Charsets.UTF_8)).use { writer ->
                writer.beginObject()
                for ((key, status) in listOf("cards" to "remaining", "understood" to "understood", "mastered" to "mastered")) {
                    writer.name(key).beginArray()
                    db.rawQuery(
                        "SELECT id,q,a,topic,qimg,aimg,${if (hasColor) "color" else "'#f7f9ff'"} FROM cards WHERE status = ? ORDER BY position",
                        arrayOf(status)
                    ).use { c ->
                        while (c.moveToNext()) {
                            writer.beginObject()
                            for ((field, index) in listOf("id" to 0, "q" to 1, "a" to 2, "topic" to 3,
                                "qImg" to 4, "aImg" to 5, "color" to 6)) {
                                writer.name(field).value(c.getString(index) ?: "")
                            }
                            writer.endObject()
                        }
                    }
                    writer.endArray()
                }
                writer.endObject()
            }
        }
    }

    fun updateStatus(context: Context, id: String, status: String) {
        require(status in listOf("remaining", "understood", "mastered", "deleted"))
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
