package uk.co.qwen.assistant

import org.junit.Assert.*
import org.junit.Test

class PromptBuilderTest {
    @Test fun generalFastModeHasNoSystemOrSoftSwitch() {
        val p=PromptBuilder.build(emptyList(),"hello",false,false)
        assertFalse(p.contains("<|im_start|>system"))
        assertFalse(p.contains("/no_think"))
        assertFalse(p.contains("/think"))
        assertTrue(p.endsWith("<think>\n\n</think>\n\n"))
    }

    @Test fun medicalModeAddsOnlyShortSystemPrompt() {
        val p=PromptBuilder.build(emptyList(),"chest pain management",false,true)
        assertTrue(p.contains("<|im_start|>system"))
        assertTrue(p.contains("medical study assistant"))
    }

    @Test fun historyIsBoundedToThreeFinalTurns() {
        val h=(1..4).map { ChatTurn("user-$it","answer-$it") }
        val p=PromptBuilder.build(h,"next",true,false)
        assertFalse(p.contains("user-1"))
        assertFalse(p.contains("answer-1"))
        assertTrue(p.contains("user-2"))
        assertTrue(p.contains("answer-4"))
        assertTrue(p.endsWith("<think>\n"))
    }

    @Test fun thinkingScratchpadIsNotReturnedAsAnswer() {
        val raw="private scratch reasoning\n</think>\nFinal answer here<|im_end|>"
        assertEquals("Final answer here",PromptBuilder.visibleAnswer(raw,true))
    }
}
