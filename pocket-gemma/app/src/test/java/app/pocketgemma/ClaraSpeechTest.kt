package app.pocketgemma

import org.junit.Assert.*
import org.junit.Test

class ClaraSpeechTest {
    @Test fun longReadingsPreserveEveryCharacterWithinEngineLimits() {
        val text = "A long explanation with several sentences. ".repeat(250) + "x".repeat(5000)
        val chunks = claraSpeechChunks(text)
        assertEquals(text, chunks.joinToString("") { text.substring(it) })
        assertTrue(chunks.all { it.count() in 1..1800 })
        assertEquals(0, chunks.first().first)
        assertEquals(text.lastIndex, chunks.last().last)
    }
    @Test fun sentenceHighlightRangesIncludeTheFinalUnpunctuatedWords() {
        val text = "First sentence.\nSecond sentence? Final words"
        val ranges = claraSpeechChunks(text)
        assertEquals(text, ranges.joinToString("") { text.substring(it) })
        assertTrue(text.substring(ranges.last()).endsWith("Final words"))
        assertTrue(claraSpeechChunks("").isEmpty())
    }
}
