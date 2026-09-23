package uk.co.qwen.assistant

object Native {
    init { System.loadLibrary("assistant") }
    external fun load(path:String)
    external fun generate(prompt:String,maxTokens:Int,thinking:Boolean):ByteArray
    external fun cancel()
}
