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
    @Test fun markdownSpeechSkipsFormattingAndLinkUrls() {
        val actual = claraSpokenText("# **First**\n- [NICE guideline](https://nice.org.uk)\n- \u0060oxygen\u0060")
        assertTrue(actual.contains("First"))
        assertTrue(actual.contains("NICE guideline"))
        assertTrue(actual.contains("oxygen"))
        assertFalse(actual.contains("https"))
        assertFalse(actual.contains("**"))
        assertFalse(actual.contains("#"))
    }
    @Test fun clinicalComparisonsAndCurrencyStayMeaningful() {
        val actual = claraSpokenText("SpO₂ < 92%, ≥ 5 mg/day. A → B. $20")
        assertTrue(actual.contains("less than"))
        assertTrue(actual.contains("greater than or equal to"))
        assertTrue(actual.contains("percent"))
        assertTrue(actual.contains("5 mg per day"))
        assertTrue(actual.contains("A to B"))
        assertTrue(actual.contains("20 dollars"))
        assertFalse(actual.contains("$"))
    }
    @Test fun fencedCodeOmitsFenceAndLanguageLabel() {
        val actual = claraSpokenText("\u0060\u0060\u0060kotlin\nval count = 3\n\u0060\u0060\u0060")
        assertTrue(actual.contains("val count = 3"))
        assertFalse(actual.contains("kotlin"))
        assertFalse(actual.contains("\u0060"))
    }
    @Test fun markdownDisplayDoesNotShowMarkers() {
        val formatted = ClaraMarkdown.display("## Header\n\n- **Bold** term")
        assertTrue(formatted.text.contains("Header"))
        assertTrue(formatted.text.contains("Bold"))
        assertFalse(formatted.text.contains("**"))
    }
}
