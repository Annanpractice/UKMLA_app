package uk.co.qwen.assistant

import org.junit.Assert.*
import org.junit.Test

class PromptBuilderTest {
    @Test fun generalModeHasNoSystemPromptOrThinkingToken() {
        val p=PromptBuilder.build(emptyList(),"hello",false,false)
        assertFalse(p.contains("<|turn>system"))
        assertFalse(p.contains("<|think|>"))
        assertTrue(p.contains("<|turn>user\nhello<turn|>"))
        assertTrue(p.endsWith("<|turn>model\n"))
    }

    @Test fun medicalModeAddsShortSystemPrompt() {
        val p=PromptBuilder.build(emptyList(),"chest pain management",false,true)
        assertTrue(p.contains("<|turn>system"))
        assertTrue(p.contains("medical study assistant"))
        assertFalse(p.contains("<|think|>"))
    }

    @Test fun thinkingModeUsesGemmaControlToken() {
        val p=PromptBuilder.build(emptyList(),"reason about this",true,false)
        assertTrue(p.contains("<|turn>system\n<|think|><turn|>"))
    }

    @Test fun historyIsBoundedToThreeFinalTurns() {
        val h=(1..4).map { ChatTurn("user-$it","answer-$it") }
        val p=PromptBuilder.build(h,"next",true,false)
        assertFalse(p.contains("user-1"))
        assertFalse(p.contains("answer-1"))
        assertTrue(p.contains("user-2"))
        assertTrue(p.contains("answer-4"))
    }

    @Test fun thinkingScratchpadIsNotReturnedAsAnswer() {
        val raw="<|channel>thought\nprivate scratch reasoning<channel|>Final answer here<turn|>"
        assertEquals("Final answer here",PromptBuilder.visibleAnswer(raw,true))
    }

    @Test fun normalAnswerPassesThrough() {
        assertEquals("Direct answer",PromptBuilder.visibleAnswer("Direct answer<turn|>",false))
    }
}
