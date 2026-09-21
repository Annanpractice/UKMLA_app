package uk.co.ukmla.reader

import android.content.Context
import android.database.sqlite.SQLiteDatabase

data class Source(val id: Long, val title: String, val topic: String, val body: String, val attribution: String, val kind: String) {
    fun context() = "$title — $attribution\n$body"
}
class CardStore(context: Context) {
    private val db: SQLiteDatabase
    init {
        val file=context.getDatabasePath("reader-v1.db")
        file.parentFile!!.mkdirs()
        if (!file.exists()) context.assets.open("reader.db").use { input -> file.outputStream().use { input.copyTo(it) } }
        db=SQLiteDatabase.openDatabase(file.path,null,SQLiteDatabase.OPEN_READONLY)
    }
    private fun query(sql: String, args: Array<String>): List<Source> = db.rawQuery(sql,args).use { c ->
        buildList { while(c.moveToNext()) add(Source(c.getLong(0),c.getString(1),c.getString(2),c.getString(3),c.getString(4),c.getString(5))) }
    }
    fun browse() = query("SELECT * FROM entries WHERE kind='card' ORDER BY title",emptyArray())
    fun search(text: String, limit: Int=12): List<Source> {
        val terms=ReaderLogic.terms(text)
        if(terms.isEmpty()) return emptyList()
        val match=terms.joinToString(" OR ") { "\"$it\"" }
        val candidates=query("SELECT entries.* FROM entries JOIN lookup ON entries.id=lookup.docid WHERE lookup MATCH ?",arrayOf(match))
        val phrase=ReaderLogic.words(text).joinToString(" ")
        return candidates.map { source ->
            val title=ReaderLogic.words(source.title).joinToString(" ")
            val body=ReaderLogic.words(source.body).toSet()
            val titleWords=ReaderLogic.words(source.title).toSet()
            val hits=terms.count { it in body || it in titleWords }
            val score=(if(title==phrase) 1000 else 0)+(if(title.contains(phrase)) 200 else 0)+terms.count { it in titleWords }*30+hits*4+(if(source.kind=="glossary" && ReaderLogic.shortQuery(text)) 5 else 0)
            Triple(source,score,hits)
        }.filter { (_,_,hits) -> terms.size<=3 || hits>=minOf(3,terms.size) }
            .sortedByDescending { it.second }.take(limit).map { it.first }
    }
    fun close() = db.close()
}
