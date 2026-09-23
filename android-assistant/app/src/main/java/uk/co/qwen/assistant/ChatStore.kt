package uk.co.qwen.assistant

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object ChatStore {
    private const val PREFS="chat_history"
    private const val KEY="turns"

    fun load(context:Context):MutableList<ChatTurn> {
        val raw=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(KEY,"[]") ?: "[]"
        return runCatching {
            val a=JSONArray(raw)
            MutableList(a.length()) { i ->
                val o=a.getJSONObject(i)
                ChatTurn(o.optString("user"),o.optString("assistant"))
            }
        }.getOrElse { mutableListOf() }
    }

    fun save(context:Context,turns:List<ChatTurn>) {
        val a=JSONArray()
        turns.takeLast(20).forEach { turn ->
            a.put(JSONObject().put("user",turn.user).put("assistant",turn.assistant))
        }
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(KEY,a.toString()).apply()
    }

    fun clear(context:Context) {
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().clear().apply()
    }
}
