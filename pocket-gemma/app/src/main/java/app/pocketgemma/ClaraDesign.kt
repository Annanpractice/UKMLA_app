package app.pocketgemma

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlin.math.sin

object ClaraColors {
    val background = Color(0xFF0C1019)
    val surface = Color(0xFF1A2232)
    val accent = Color(0xFF9CE8D8)
    val violet = Color(0xFFAAA5F6)
    val text = Color(0xFFF2F4FA)
    val muted = Color(0xFFADB7CC)
}

// Small original vector glyphs keep the app crisp at every display scale.
@Composable
fun ClaraGlyph(kind: String, description: String?, modifier: Modifier = Modifier.size(22.dp), tint: Color = ClaraColors.muted) {
    Canvas(modifier.then(if (description == null) Modifier else Modifier.semantics { contentDescription = description })) {
        val u = size.width / 24f
        val stroke = 1.7f * u
        fun line(x: Float, y: Float, x2: Float, y2: Float) = drawLine(tint, Offset(x*u,y*u), Offset(x2*u,y2*u), stroke, StrokeCap.Round)
        fun path(vararg points: Pair<Float,Float>) {
            val p = Path(); points.forEachIndexed { i, (x,y) -> if (i == 0) p.moveTo(x*u,y*u) else p.lineTo(x*u,y*u) }
            drawPath(p,tint,style=Stroke(stroke, cap=StrokeCap.Round))
        }
        when(kind) {
            "menu" -> { line(4f,6f,20f,6f); line(4f,12f,16f,12f); line(4f,18f,20f,18f) }
            "more" -> listOf(5f,12f,19f).forEach { drawCircle(tint,1.3f*u,Offset(12f*u,it*u)) }
            "search" -> { drawCircle(tint,6.5f*u,Offset(10.5f*u,10.5f*u),style=Stroke(stroke)); line(16f,16f,21f,21f) }
            "left" -> path(15f to 5f,8f to 12f,15f to 19f)
            "right" -> path(9f to 5f,16f to 12f,9f to 19f)
            "close" -> { line(6f,6f,18f,18f); line(18f,6f,6f,18f) }
            "check" -> path(4f to 12f,9f to 17f,20f to 6f)
            "stop" -> drawRoundRect(tint,Offset(6f*u,6f*u),Size(12f*u,12f*u),CornerRadius(2f*u))
            "speaker" -> {
                path(3f to 9f,7f to 9f,12f to 5f,12f to 19f,7f to 15f,3f to 15f,3f to 9f)
                drawArc(tint,-60f,120f,false,Offset(9f*u,3f*u),Size(13f*u,18f*u),style=Stroke(stroke,cap=StrokeCap.Round))
            }
            "mic" -> {
                drawRoundRect(tint,Offset(9f*u,3f*u),Size(6f*u,11f*u),CornerRadius(3f*u),style=Stroke(stroke))
                drawArc(tint,0f,180f,false,Offset(5f*u,5f*u),Size(14f*u,13f*u),style=Stroke(stroke,cap=StrokeCap.Round))
                line(12f,18f,12f,22f); line(8f,22f,16f,22f)
            }
            "send" -> { path(12f to 20f,12f to 4f); path(6f to 10f,12f to 4f,18f to 10f) }
            "settings" -> {
                line(4f,7f,20f,7f); line(4f,17f,20f,17f)
                drawCircle(tint,2.5f*u,Offset(9f*u,7f*u)); drawCircle(tint,2.5f*u,Offset(16f*u,17f*u))
            }
            else -> { path(12f to 2f,14.5f to 9.5f,22f to 12f,14.5f to 14.5f,12f to 22f,9.5f to 14.5f,2f to 12f,9.5f to 9.5f,12f to 2f) }
        }
    }
}

@Composable
fun ClaraOrb(active: Boolean, modifier: Modifier = Modifier) {
    val pulse = if (active) {
        val transition = rememberInfiniteTransition(label = "Clara speaking")
        transition.animateFloat(.68f,1f,infiniteRepeatable(tween(950),RepeatMode.Reverse),label="Breath").value
    } else .82f
    Canvas(modifier) {
        val r = size.minDimension / 2
        drawCircle(Brush.radialGradient(listOf(ClaraColors.violet.copy(alpha=.25f*pulse),Color.Transparent)), r)
        drawCircle(Brush.linearGradient(listOf(ClaraColors.accent, ClaraColors.violet)),r*.70f,style=Stroke(r*.13f))
        drawCircle(ClaraColors.accent.copy(alpha=.6f),r*.17f*pulse,Offset(center.x-r*.15f,center.y-r*.10f))
    }
}

@Composable
private fun SpeechIndicator(label: String) {
    val transition = rememberInfiniteTransition(label="Voice activity")
    val phase by transition.animateFloat(0f,6.28f,infiniteRepeatable(tween(1600,easing=LinearEasing)),label="Speech bars")
    Row(verticalAlignment=Alignment.CenterVertically, horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        Canvas(Modifier.size(25.dp,18.dp)) {
            repeat(5) { i ->
                val h = size.height*(.25f+.65f*kotlin.math.abs(sin(phase+i*.8f)))
                val x=size.width*(i+1)/6
                drawLine(ClaraColors.accent,Offset(x,(size.height-h)/2),Offset(x,(size.height+h)/2),2.dp.toPx(),StrokeCap.Round)
            }
        }
        Text(label,color=ClaraColors.accent,fontSize=11.sp)
    }
}

/** Speech offsets refer to the plain text submitted to TTS, including chunk offsets. */
data class ClaraSpeech(val text: String = "", val start: Int = 0, val end: Int = 0, val speaking: Boolean = false)

fun claraSpokenText(text: String) = ClaraMarkdown.speech(text)

// Sentence boundaries give third-party voices a useful highlight even when they
// don't implement Android's word-range callbacks. Long sentences are split safely.
fun claraSpeechChunks(text: String, limit: Int = 1800): List<IntRange> {
    val result = mutableListOf<IntRange>()
    var start = 0
    while (start < text.length) {
        val maxEnd = minOf(start + limit, text.length)
        val sentence = Regex("[.!?](?:\\s|$)|\\n").find(text, start)
        val sentenceEnd = sentence?.range?.last?.plus(1)
        val end = when {
            sentenceEnd != null && sentenceEnd <= maxEnd -> sentenceEnd
            maxEnd == text.length -> maxEnd
            else -> (text.lastIndexOf(' ', maxEnd-1).takeIf { it > start }?.plus(1) ?: maxEnd)
        }
        result += start until end
        start = end
    }
    return result
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClaraTutorPanel(
    card: ClaraStudyCard,
    lines: List<ChatLine>,
    input: String,
    onInput: (String) -> Unit,
    onSend: (String) -> Unit,
    modelAvailable: Boolean,
    onOpenChat: () -> Unit,
    onMic: () -> Unit,
    listening: Boolean,
    recognitionBusy: Boolean,
    loading: Boolean,
    generating: Boolean,
    status: String,
    speech: ClaraSpeech,
    speakReplies: Boolean,
    onSpeakReplies: (Boolean) -> Unit,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
    onVoiceSettings: () -> Unit,
    onModelSettings: () -> Unit,
    onDismiss: () -> Unit
) {
    BackHandler { onDismiss() }
    ModalBottomSheet(onDismissRequest=onDismiss,
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
        // The tutor is a fixed-height screen. Sheet swipes compete with the chat's
        // nested scroll when the list reaches its lower boundary.
        sheetGesturesEnabled=false,
        containerColor=ClaraColors.background, contentColor=ClaraColors.text,
        dragHandle=null) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(.95f).imePadding()) {
            Row(Modifier.padding(start=18.dp,end=8.dp,top=12.dp,bottom=8.dp),verticalAlignment=Alignment.CenterVertically) {
                ClaraOrb(active=generating||loading||speech.speaking,modifier=Modifier.size(38.dp))
                Column(Modifier.weight(1f).padding(start=10.dp)) {
                    Text("Clara",fontSize=21.sp,fontWeight=FontWeight.SemiBold)
                    Text("Card tutor · Gemma on this device",fontSize=11.sp,color=ClaraColors.muted)
                }
                IconButton(onClick=onVoiceSettings) { ClaraGlyph("speaker","Voice and reading speed") }
                IconButton(onClick=onModelSettings,enabled=!generating&&!loading) { ClaraGlyph("settings","Tutor and model controls") }
                IconButton(onClick=onDismiss) { ClaraGlyph("close","Return to study card") }
            }
            Surface(color=ClaraColors.surface,shape=RoundedCornerShape(16.dp),modifier=Modifier.fillMaxWidth().padding(horizontal=18.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(card.topic.ifBlank { "CURRENT CARD" },fontSize=10.sp,color=ClaraColors.accent,maxLines=1,overflow=TextOverflow.Ellipsis)
                    Text(cardPlainText(card.question),fontSize=13.sp,lineHeight=19.sp,
                        modifier=Modifier.heightIn(max=100.dp).verticalScroll(rememberScrollState()).padding(top=5.dp))
                }
            }
            val turns=lines.filterNot { it.displayText.startsWith("Study card:") }
            val listState=rememberLazyListState()
            // Only a user's scroll updates whether the tutor follows new text.
            // Programmatic positioning must never re-arm its own scroll observer.
            var followBottom by remember { mutableStateOf(true) }
            var positioningLatest by remember { mutableStateOf(false) }
            LaunchedEffect(listState) {
                snapshotFlow { listState.isScrollInProgress to listState.canScrollForward }.collect { (scrolling, canGoDown) ->
                    if (scrolling && !positioningLatest) followBottom = !canGoDown
                }
            }
            val activityRowVisible = loading || generating || speech.speaking || recognitionBusy
            LaunchedEffect(turns.size, turns.lastOrNull()?.text?.length, activityRowVisible) {
                if (followBottom && !listState.isScrollInProgress && turns.isNotEmpty() && listState.canScrollForward) {
                    positioningLatest = true
                    try {
                        val endIndex = listState.layoutInfo.totalItemsCount - 1
                        if (endIndex >= 0) {
                            if (listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index != endIndex) {
                                listState.scrollToItem(endIndex)
                            }
                            val geometry = listState.layoutInfo
                            val last = geometry.visibleItemsInfo.lastOrNull()
                            if (last != null && last.index == endIndex && listState.canScrollForward) {
                                // Scroll only the measurable remaining distance, not an
                                // unbounded 100,000px request that crosses the boundary.
                                val remaining = (last.offset + last.size +
                                    geometry.afterContentPadding - geometry.viewportEndOffset).coerceAtLeast(0)
                                if (remaining > 1) listState.scrollBy(remaining.toFloat())
                            }
                        }
                    } finally {
                        positioningLatest = false
                    }
                }
            }
            LazyColumn(state=listState,modifier=Modifier.weight(1f).fillMaxWidth().testTag("clara_tutor_messages"),
                overscrollEffect=null,
                contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
                if (turns.isEmpty()&&!loading&&!generating) item {
                    Text("Clara will use the question and reference answer from this card. Ask a question, or give your answer in your own words.",
                        color=ClaraColors.muted,fontSize=14.sp,lineHeight=22.sp)
                }
                itemsIndexed(turns) { index,line ->
                    val assistant=line.role=="assistant"
                    val display=remember(line.displayText, line.text) {
                        ClaraMarkdown.display(line.displayText.ifBlank { line.text })
                    }
                    // No height animation in a streaming list: it can tug on the
                    // scroll offset while the user reaches the end.
                    Column(Modifier.fillMaxWidth(),horizontalAlignment=if(assistant) Alignment.Start else Alignment.End) {
                            if(assistant) Text("CLARA",color=ClaraColors.accent,fontSize=9.sp,letterSpacing=1.5.sp,modifier=Modifier.padding(bottom=7.dp))
                            Surface(shape=RoundedCornerShape(18.dp),color=if(assistant) ClaraColors.surface else Color(0xFF293845),
                                modifier=Modifier.widthIn(max=600.dp)) {
                                SelectionContainer {
                                    val annotated=buildAnnotatedString {
                                        append(display)
                                        // Word-range highlights are only valid where displayed
                                        // characters exactly match those sent to the TTS engine.
                                        if(speech.speaking&&speech.text==display.text&&speech.end>speech.start) {
                                            addStyle(SpanStyle(color=ClaraColors.accent,background=Color(0xFF30464A)),
                                                speech.start.coerceIn(0,length),speech.end.coerceIn(0,length))
                                        }
                                    }
                                    Text(annotated,color=ClaraColors.text,fontSize=16.sp,lineHeight=25.sp,modifier=Modifier.padding(15.dp))
                                }
                            }
                            if(assistant&&!(generating&&index==turns.lastIndex)) TextButton(onClick={onSpeak(line.displayText.ifBlank { line.text })},contentPadding=PaddingValues(vertical=0.dp,horizontal=4.dp)) {
                                ClaraGlyph("speaker",null,Modifier.size(14.dp)); Text("  Read aloud",fontSize=11.sp,color=ClaraColors.muted)
                            }
                        }
                }
                if(loading||generating||speech.speaking||recognitionBusy) item { SpeechIndicator(when {
                    listening -> "Listening to you…"
                    recognitionBusy -> "Recognising your reply…"
                    speech.speaking -> "Clara is speaking"
                    loading -> "Preparing your tutor…"
                    else -> "Clara is thinking…"
                }) }
            }
            if(status.isNotBlank()) Text(status,color=ClaraColors.muted,fontSize=11.sp,maxLines=3,
                modifier=Modifier.fillMaxWidth().padding(horizontal=20.dp,vertical=2.dp))
            if (!modelAvailable) Button(onClick=onOpenChat,modifier=Modifier.fillMaxWidth().padding(horizontal=18.dp)) {
                Text("Open model download")
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal=18.dp),
                horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                listOf("Give me a hint" to "Give me one small hint from this card without revealing the full answer.",
                    "Explain" to "Please explain this card's reference answer using only its stated points.",
                    "Quiz me" to "Ask me one focused question based on this card's reference answer.").forEach { (label,prompt) ->
                    AssistChip(onClick={onSend(prompt)},enabled=modelAvailable&&!generating&&!loading&&!recognitionBusy,label={Text(label,fontSize=11.sp)})
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal=16.dp),verticalAlignment=Alignment.CenterVertically) {
                Text("Speak replies",color=ClaraColors.muted,fontSize=12.sp,modifier=Modifier.weight(1f))
                Switch(checked=speakReplies,onCheckedChange=onSpeakReplies,modifier=Modifier.height(38.dp))
                if(generating||speech.speaking) TextButton(onClick=onStop) { Text(if(generating) "Stop" else "Stop voice") }
            }
            Row(Modifier.fillMaxWidth().padding(start=12.dp,end=16.dp,bottom=12.dp,top=4.dp),verticalAlignment=Alignment.CenterVertically) {
                FilledIconButton(onClick=onMic,enabled=modelAvailable&&!generating&&!loading&&(!recognitionBusy||listening),
                    modifier=Modifier.size(48.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=ClaraColors.surface)) {
                    ClaraGlyph(if(listening) "stop" else "mic",if(listening) "Finish speaking" else "Speak your reply",tint=ClaraColors.accent)
                }
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(value=input,onValueChange=onInput,modifier=Modifier.weight(1f),
                    placeholder={Text("Talk it through…",fontSize=14.sp)},maxLines=4,shape=RoundedCornerShape(22.dp),
                    enabled=modelAvailable&&!loading&&!generating&&!recognitionBusy)
                Spacer(Modifier.width(8.dp))
                FilledIconButton(onClick={onSend(input)},enabled=modelAvailable&&input.isNotBlank()&&!generating&&!loading&&!recognitionBusy,
                    modifier=Modifier.size(44.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=ClaraColors.accent)) {
                    ClaraGlyph("send","Send message",tint=ClaraColors.background)
                }
            }
        }
    }
}
