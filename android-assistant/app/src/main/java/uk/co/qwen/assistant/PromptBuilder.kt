package uk.co.qwen.assistant

data class ChatTurn(val user:String,val assistant:String)

object PromptBuilder {
    private fun safe(text:String)=text.replace("<|","‹|").replace("|>","|›")

    fun build(history:List<ChatTurn>,user:String,thinking:Boolean,medical:Boolean):String =
        buildString {
            if(medical) {
                append("<|im_start|>system\n")
                append("You are a concise medical study assistant. Give practical, cautious answers; use UK terminology when known, flag urgent red flags when relevant, and say when uncertain.")
                append("<|im_end|>\n")
            }
            history.takeLast(3).forEach { turn ->
                append("<|im_start|>user\n")
                append(safe(turn.user.take(650)))
                append("<|im_end|>\n<|im_start|>assistant\n")
                append(safe(turn.assistant.take(950)))
                append("<|im_end|>\n")
            }
            append("<|im_start|>user\n")
            append(safe(user.take(2200)))
            append(if(thinking) " /think" else " /no_think")
            append("<|im_end|>\n<|im_start|>assistant\n")
            if(thinking) append("<think>\n") else append("<think>\n\n</think>\n")
        }

    fun visibleAnswer(raw:String,thinking:Boolean):String {
        val clipped=raw.substringBefore("<|im_end|>")
        if(thinking) {
            if(!clipped.contains("</think>")) return ""
            return clipped.substringAfterLast("</think>").trim()
        }
        return clipped
            .replace(Regex("<think>[\\s\\S]*?</think>"),"")
            .substringAfterLast("</think>")
            .trim()
    }
}
