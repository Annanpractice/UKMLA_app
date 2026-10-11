package uk.co.qwen.assistant

data class ChatTurn(val user:String,val assistant:String)

object PromptBuilder {
    private fun safe(text:String)=text
        .replace("<|","‹|")
        .replace("<turn|>","‹turn|›")
        .replace("<channel|>","‹channel|›")

    fun build(history:List<ChatTurn>,user:String,thinking:Boolean,medical:Boolean):String =
        buildString {
            val system=buildString {
                if(thinking) append("<|think|>")
                if(medical) {
                    if(isNotEmpty()) append("\n")
                    append("You are a concise medical study assistant. Give practical, cautious answers; use UK terminology when known, flag urgent red flags when relevant, and say when uncertain.")
                }
            }
            if(system.isNotEmpty()) {
                append("<|turn>system\n")
                append(system)
                append("<turn|>\n")
            }
            history.takeLast(3).forEach { turn ->
                append("<|turn>user\n")
                append(safe(turn.user.take(650)))
                append("<turn|>\n<|turn>model\n")
                append(safe(turn.assistant.take(950)))
                append("<turn|>\n")
            }
            append("<|turn>user\n")
            append(safe(user.take(2200)))
            append("<turn|>\n<|turn>model\n")
        }

    fun visibleAnswer(raw:String,thinking:Boolean):String {
        val clipped=raw.substringBefore("<turn|>").trim()
        val thoughtStart=clipped.indexOf("<|channel>thought")
        if(thoughtStart<0) return clipped
        val thoughtEnd=clipped.indexOf("<channel|>",thoughtStart)
        if(thoughtEnd<0) return if(thinking) "" else clipped.substring(0,thoughtStart).trim()
        return (clipped.substring(0,thoughtStart)+clipped.substring(thoughtEnd+"<channel|>".length)).trim()
    }
}
