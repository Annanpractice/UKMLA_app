package uk.co.qwen.assistant

import org.junit.Assert.assertEquals
import org.junit.Test

class PromptBuilderTest {
    @Test fun chatTurnRetainsLocalHistoryFields() {
        val turn=ChatTurn("question","answer")
        assertEquals("question",turn.user)
        assertEquals("answer",turn.assistant)
    }
}
