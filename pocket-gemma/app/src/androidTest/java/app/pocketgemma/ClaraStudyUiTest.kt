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
        val folder=File(context.getExternalFilesDir(null),"ui-review").apply { mkdirs() }
        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).takeScreenshot(File(folder,"$name.png"))
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
                    importMessage="",importError=false,onMark={_,_->},onSpeak={spoken=it},onDiscuss={},
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
}
