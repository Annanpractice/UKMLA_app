package app.pocketgemma

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import java.io.File

class ClaraStudyUiTest {
    @get:Rule val ui = createComposeRule()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun screenshot(name: String) {
        val device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        device.waitForIdle(2000)
        device.executeShellCommand("mkdir -p /data/local/tmp/clara-ui-review")
        device.executeShellCommand("screencap -p /data/local/tmp/clara-ui-review/$name.png")
        org.junit.Assert.assertTrue(device.executeShellCommand("stat -c %s /data/local/tmp/clara-ui-review/$name.png").trim().toLong() > 0)
    }
    @Test fun readAloudUsesVisibleSideAndNavigationResetsAnswer() {
        val card=ClaraStudyCard("ui-review-1","<h2>What are the major categories of genomic damage?</h2>",
            "<p>A reference answer for checking the visible side.</p>","DNA Damage")
        val next=card.copy(id="ui-review-2",question="<h2>Next question</h2>")
        ClaraDeckStorage.saveCard(context,card); ClaraDeckStorage.saveCard(context,next)
        var spoken=""
        ui.setContent {
            MaterialTheme(colorScheme=darkColorScheme(primary=ClaraColors.accent,surface=ClaraColors.background)) {
                ClaraFlashcardScreen(deck=ClaraStudyDeck(listOf(card,next)),onBack={},onImport={},onExport={},onSaveCard={},
                    importMessage="",importError=false,onMark={_,_->},onSpeak={spoken=it},onDiscuss={},onSummariseSelection={_,_->},
                    isSpeaking=false,speechReady=true,speechMessage="",onStopSpeech={},onVoiceSettings={},onModelSettings={},
                    modelStatus="Ready",modelBusy=false,tutorPrompt="",onTutorPromptChange={},speakTutorReplies=true,onSpeakTutorRepliesChange={})
            }
        }
        ui.waitUntil(10000) { ui.onAllNodesWithText("QUESTION").fetchSemanticsNodes().isNotEmpty() }
        ui.onNodeWithText("Read aloud",substring=true).performClick()
        ui.runOnIdle { assertEquals(cardPlainText(card.question),spoken) }
        screenshot("01-study-question")
        ui.onNodeWithText("Reveal answer").performClick()
        ui.waitForIdle()
        ui.onNodeWithText("Read aloud",substring=true).performClick()
        ui.runOnIdle { assertEquals(cardPlainText(card.answer),spoken) }
        screenshot("02-study-answer")
        ui.onNodeWithContentDescription("Next card").performClick()
        ui.onNodeWithText("Reveal answer").assertIsDisplayed()
    }
    @Test fun tutorShowsCurrentCardVoiceControlsAndSpeechHighlight() {
        val card=ClaraStudyCard("tutor-review","What are the major categories of genomic damage?","Reference answer","DNA Damage")
        val reply="Let's take this one step at a time. What is the first category listed in your card?"
        ui.setContent {
            MaterialTheme(colorScheme=darkColorScheme(primary=ClaraColors.accent,surface=ClaraColors.background)) {
                ClaraTutorPanel(card=card,lines=listOf(ChatLine("user","Can you give me a hint?"),ChatLine("assistant",reply)),
                    input="",onInput={},onSend={},modelAvailable=true,onOpenChat={},onMic={},listening=false,recognitionBusy=false,loading=false,
                    generating=false,status="GPU backend initialized",speech=ClaraSpeech(reply,0,33,true),speakReplies=true,
                    onSpeakReplies={},onSpeak={},onStop={},onVoiceSettings={},onModelSettings={},onDismiss={})
            }
        }
        ui.onNodeWithText(card.question).assertIsDisplayed()
        ui.onNodeWithContentDescription("Speak your reply").assertIsDisplayed()
        ui.onNodeWithText("Speak replies").assertIsDisplayed()
        screenshot("03-clara-conversation")
    }
    @Test fun tutorChatHasStableBottomBoundaryAfterRepeatedOverscroll() {
        val card=ClaraStudyCard("scroll-boundary","Which services provide care?","Reference answer","Psychiatry")
        val longReply=(1..40).joinToString("\\n") { "Clara answer line $it with further clinical discussion." }
        ui.setContent {
            MaterialTheme(colorScheme=darkColorScheme(primary=ClaraColors.accent,surface=ClaraColors.background)) {
                ClaraTutorPanel(card=card,lines=listOf(ChatLine("assistant",longReply)),
                    input="",onInput={},onSend={},modelAvailable=true,onOpenChat={},onMic={},listening=false,recognitionBusy=false,loading=false,
                    generating=false,status="GPU backend ready",speech=ClaraSpeech(),speakReplies=false,
                    onSpeakReplies={},onSpeak={},onStop={},onVoiceSettings={},onModelSettings={},onDismiss={})
            }
        }
        val chat=ui.onNodeWithTag("clara_tutor_messages")
        repeat(8) { chat.performTouchInput { swipeUp() } }
        ui.waitForIdle()
        val footerY=ui.onNodeWithText("Speak replies").fetchSemanticsNode().boundsInRoot.top
        repeat(3) { chat.performTouchInput { swipeUp() } }
        ui.waitForIdle()
        val afterOverscrollY=ui.onNodeWithText("Speak replies").fetchSemanticsNode().boundsInRoot.top
        org.junit.Assert.assertEquals("Bottom overscroll displaced the fixed tutor footer", footerY, afterOverscrollY, 1f)
        ui.onNodeWithText("Talk it through…").assertIsDisplayed()
    }

}
