package app.pocketgemma

import android.content.Context
import android.net.Uri
import android.text.Html
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardType
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.util.Base64
import java.util.UUID
import kotlinx.coroutines.launch
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

data class ClaraStudyCard(
    val id: String,
    val question: String,
    val answer: String,
    val topic: String,
    val qImage: String = "",
    val aImage: String = "",
    val color: String = "#f7f9ff",
    val status: String = "remaining"
)

data class ClaraStudyDeck(val cards: List<ClaraStudyCard> = emptyList(), val revision: Long = System.nanoTime())

fun cardPlainText(html: String): String =
    Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT).toString().replace(Regex("\\s+"), " ").trim()

// Displays locally imported formatting and data-URI images without JavaScript,
// disk access, Android bridges, or external network requests.
@Composable
private fun StudyCardFace(html: String, imageData: String, faceColor: String) {
    val document = remember(html, imageData, faceColor) {
        val safeColor = faceColor.takeIf { it.matches(Regex("#[0-9A-Fa-f]{6}")) } ?: "#f7f9ff"
        val image = if (imageData.startsWith("data:image/"))
            "<figure><img src=\"" + imageData.replace("\"", "") + "\" /></figure>" else ""
        """<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>
html,body{height:100%;min-height:100%;box-sizing:border-box;margin:0;background:$safeColor;color:#101321}
body{font:19px system-ui,Roboto,sans-serif;line-height:1.42;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 14px;overflow-wrap:anywhere}
body>*{max-width:100%}img{max-width:94%;height:auto;max-height:360px;object-fit:contain;border-radius:9px}
table{max-width:100%;display:block;overflow-x:auto}figure{margin:12px 0}ul,ol{text-align:left}p{margin:8px 0}
</style></head><body>""" + html + image + "</body></html>"
    }
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                settings.javaScriptEnabled = false
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.blockNetworkLoads = true
                settings.setSupportMultipleWindows(false)
                webViewClient = WebViewClient()
                tag = document
                loadDataWithBaseURL(null, document, "text/html", "UTF-8", null)
            }
        },
        update = { view ->
            if (view.tag != document) {
                view.tag = document
                view.loadDataWithBaseURL(null, document, "text/html", "UTF-8", null)
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}

private fun pastelColour(hex: String): Color = runCatching {
    Color(android.graphics.Color.parseColor(hex))
}.getOrElse { Color(0xFFF7F9FF) }

private fun lightenCardColour(hex: String): String = runCatching {
    val color = android.graphics.Color.parseColor(hex)
    fun channel(component: Int): String {
        val lighter = (component + (255 - component) * 0.08f).toInt().coerceIn(0, 255)
        return lighter.toString(16).padStart(2, '0')
    }
    "#"+channel(android.graphics.Color.red(color)) +
        channel(android.graphics.Color.green(color)) +
        channel(android.graphics.Color.blue(color))
}.getOrDefault("#eef2ff")

private val CARD_COLORS = listOf("#FFEBEE","#E8F5E9","#E3F2FD","#FFFDE7","#F3E5F5",
    "#EFEBE9","#E8EAF6","#FBE9E7","#ECEFF1","#f7f9ff")

private fun applyRichTag(field: TextFieldValue, tag: String): TextFieldValue {
    val start = field.selection.min.coerceIn(0, field.text.length)
    val end = field.selection.max.coerceIn(start, field.text.length)
    val open = "<$tag>"
    val close = "</$tag>"
    val content = field.text.substring(start,end)
    val text = field.text.replaceRange(start,end,open + content + close)
    return field.copy(text=text, selection=TextRange(start + open.length, end + open.length))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClaraFlashcardScreen(
    deck: ClaraStudyDeck,
    onBack: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onSaveCard: (ClaraStudyCard) -> Unit,
    importMessage: String,
    importError: Boolean,
    onMark: (String, String) -> Unit,
    onSpeak: (String) -> Unit,
    onDiscuss: (ClaraStudyCard) -> Unit,
    tutorPrompt: String,
    onTutorPromptChange: (String) -> Unit,
    speakTutorReplies: Boolean,
    onSpeakTutorRepliesChange: (Boolean) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var view by remember { mutableStateOf("remaining") }
    var topic by remember { mutableStateOf("All topics") }
    var keyword by remember { mutableStateOf("") }
    var keywordEnabled by remember { mutableStateOf(false) }
    var index by remember { mutableIntStateOf(0) }
    var number by remember { mutableStateOf("1") }
    var showingAnswer by remember { mutableStateOf(false) }
    var locked by remember { mutableStateOf(false) }
    var optionsOpen by remember { mutableStateOf(false) }
    var topicsOpen by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    var editorOpen by remember { mutableStateOf(false) }
    var editingCard by remember { mutableStateOf<ClaraStudyCard?>(null) }
    var lastDeleted by remember { mutableStateOf<Pair<String, String>?>(null) }
    var searchHits by remember { mutableStateOf<Set<String>>(emptySet()) }
    var searchLoading by remember { mutableStateOf(false) }
    var pictureTarget by remember { mutableStateOf("q") }
    var draftQImage by remember { mutableStateOf("") }
    var draftAImage by remember { mutableStateOf("") }
    var pickedImageMessage by remember { mutableStateOf("") }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            pickedImageMessage = "Loading image…"
            try {
                val dataUri = withContext(Dispatchers.IO) {
                    val mime = context.contentResolver.getType(uri)?.takeIf { it.startsWith("image/") } ?: "image/png"
                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: error("Could not read image")
                    "data:$mime;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                }
                if (pictureTarget == "q") draftQImage = dataUri else draftAImage = dataUri
                pickedImageMessage = "Image attached to ${if (pictureTarget == "q") "question" else "answer"}."
            } catch (e: Exception) { pickedImageMessage = "Image failed: ${e.message}" }
        }
    }

    LaunchedEffect(keyword, keywordEnabled, deck) {
        if (!keywordEnabled || keyword.isBlank()) { searchHits = emptySet(); searchLoading = false }
        else {
            searchLoading = true
            searchHits = withContext(Dispatchers.IO) { ClaraDeckStorage.searchIds(context, keyword) }
            searchLoading = false
        }
    }
    val ordered = remember(deck, view) {
        if (view == "random") deck.cards.shuffled()
        else deck.cards
    }
    val shown = remember(ordered, view, topic, keyword, keywordEnabled, searchHits, searchLoading) {
        ordered.filter { c ->
            (view == "all" || view == "random" || c.status == view) &&
            (topic == "All topics" || c.topic == topic) &&
            (!keywordEnabled || keyword.isBlank() || (c.id in searchHits && !searchLoading))
        }
    }
    LaunchedEffect(shown) {
        if (index >= shown.size) index = (shown.size - 1).coerceAtLeast(0)
        if (index < 0) index = 0
        number = if (shown.isEmpty()) "0" else "${index+1}"
        showingAnswer = false
        locked = false
    }
    val selected = shown.getOrNull(index)
    val cardState = produceState<ClaraStudyCard?>(initialValue = null, key1 = selected?.id, key2 = deck.revision) {
        value = null
        if (selected != null) value = withContext(Dispatchers.IO) {
            ClaraDeckStorage.readCard(context, selected.id)
        }
    }
    val card = cardState.value
    val topics = remember(deck) { deck.cards.map { it.topic }.filter { it.isNotBlank() }.distinct().sorted() }
    val totalRemaining = remember(deck) { deck.cards.count { it.status == "remaining" } }
    val totalUnderstood = remember(deck) { deck.cards.count { it.status == "understood" } }
    val totalMastered = remember(deck) { deck.cards.count { it.status == "mastered" } }

    fun jumpTo(value: String) {
        number = value.filter { it.isDigit() }.take(7)
        val n = number.toIntOrNull()
        if (n != null && n in 1..shown.size) {
            index = n-1
            showingAnswer = false
            locked = false
        }
    }
    fun move(delta: Int) {
        if (shown.isNotEmpty()) {
            index = (index + delta + shown.size) % shown.size
            number = "${index+1}"
            showingAnswer = false
            locked = false
        }
    }
    fun changeView(to: String) { view = to; topic = "All topics"; index = 0; showingAnswer = false }
    fun changeTopic(to: String) { topic = to; index = 0; showingAnswer = false }

    // This screen follows the original Annanpractice/flashcard-app
    // flashcards.html mobile layout. Fixed header/filter/footer are outside
    // the card, so no action button can overlap the reading surface.
    val darkPanel = Color(0xFF0B1024)
    val panel = Color(0xFF202842)
    val pale = Color(0xFFF4F6FB)
    val muted = Color(0xFFC5CBE0)
    val blue = Color(0xFF0072CE)

    Column(Modifier.fillMaxSize().background(
        Brush.verticalGradient(listOf(Color(0xFF0B1330), Color(0xFF0E1222))))) {

        // Equivalent of original .topbar, .drawer-toggle and .counter.
        Row(
            modifier = Modifier.fillMaxWidth().height(56.dp)
                .background(darkPanel).padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(10.dp))
                    .background(panel).clickable { topicsOpen = true },
                contentAlignment = Alignment.Center
            ) {
                Text("☰", fontSize = 23.sp, color = pale)
            }
            Row(
                modifier = Modifier.weight(1f).height(40.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .border(1.dp, Color(0xFF4A5276), RoundedCornerShape(24.dp))
                    .background(panel).padding(horizontal = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box {
                    Box(
                        Modifier.size(29.dp).clip(RoundedCornerShape(50))
                            .background(Color.White).clickable { optionsOpen = true },
                        contentAlignment = Alignment.Center
                    ) {
                        Text("⋮", color = Color(0xFF161B2E), fontSize = 20.sp)
                    }
                    DropdownMenu(expanded = optionsOpen, onDismissRequest = { optionsOpen = false }) {
                        @Composable
                        fun action(name: String, enabled: Boolean = true, onClick: () -> Unit) {
                            DropdownMenuItem(
                                text = { Text(name) },
                                enabled = enabled,
                                onClick = { optionsOpen = false; onClick() }
                            )
                        }
                        action("Import JSON") { onImport() }
                        action("Export JSON", deck.cards.isNotEmpty()) { onExport() }
                        action("Add flashcard") {
                            editingCard = null
                            draftQImage = ""
                            draftAImage = ""
                            editorOpen = true
                        }
                        action("Edit this card", card != null) {
                            editingCard = card
                            draftQImage = card?.qImage.orEmpty()
                            draftAImage = card?.aImage.orEmpty()
                            editorOpen = true
                        }
                        HorizontalDivider()
                        action("Discuss with Clara", card != null) { card?.let(onDiscuss) }
                        action("Speak question", card != null) {
                            card?.let { onSpeak(cardPlainText(it.question)) }
                        }
                        action("Speak answer", card != null) {
                            card?.let { onSpeak(cardPlainText(it.answer)) }
                        }
                        action("Socratic tutor settings") { settingsOpen = true }
                        action("Shuffle cards", deck.cards.isNotEmpty()) { changeView("random") }
                        HorizontalDivider()
                        action("Back to Clara") { onBack() }
                    }
                }
                Spacer(Modifier.width(11.dp))
                BasicTextField(
                    value = number,
                    onValueChange = { jumpTo(it) },
                    modifier = Modifier.width(53.dp).height(28.dp)
                        .border(1.dp, Color(0xFF4A5276), RoundedCornerShape(8.dp))
                        .background(Color(0xFF161B2E), RoundedCornerShape(8.dp))
                        .wrapContentHeight(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    textStyle = TextStyle(
                        color = pale, fontSize = 16.sp, fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    ),
                )
                Spacer(Modifier.width(9.dp))
                Text("/  ${shown.size}", color = pale, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            TextButton(
                onClick = onBack,
                contentPadding = PaddingValues(horizontal = 5.dp)
            ) {
                Text("Clara", color = muted, fontSize = 13.sp)
            }
        }

        // The original .filterbar with an optional keyword enable switch.
        Row(
            modifier = Modifier.fillMaxWidth().height(60.dp)
                .background(darkPanel).padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier.weight(1f).height(44.dp)
                    .border(1.dp, Color(0xFF4A5276), RoundedCornerShape(10.dp))
                    .background(Color(0xFF161B2E), RoundedCornerShape(10.dp))
                    .padding(horizontal = 10.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                if (keyword.isBlank()) {
                    Text("Keyword filter question, answer, or topic…",
                        color = Color(0xFF8993AC), fontSize = 13.sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                BasicTextField(
                    value = keyword,
                    onValueChange = { keyword = it; index = 0 },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    textStyle = TextStyle(color = pale, fontSize = 14.sp)
                )
            }
            Checkbox(
                checked = keywordEnabled,
                onCheckedChange = { keywordEnabled = it; index = 0 },
                modifier = Modifier.size(28.dp),
                colors = CheckboxDefaults.colors(checkedColor = blue)
            )
            Text("Enable", color = muted, fontSize = 12.sp)
        }

        if (importError || (deck.cards.isEmpty() && importMessage.isNotBlank())) {
            Text(
                importMessage, color = if (importError) Color(0xFFFFB0B0) else muted,
                fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 3.dp)
            )
        }

        // Original .wrap / .flashcard, constrained by the space left between
        // the header and fixed action bars, never allowed to obscure either.
        BoxWithConstraints(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            if (selected == null) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        if (deck.cards.isEmpty()) "No flashcards loaded" else "No cards match this filter",
                        color = pale, fontSize = 18.sp
                    )
                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = if (deck.cards.isEmpty()) onImport
                            else { { keyword = ""; keywordEnabled = false; changeView("all") } }
                    ) {
                        Text(if (deck.cards.isEmpty()) "Import JSON" else "Show all cards")
                    }
                }
            } else if (card == null) {
                CircularProgressIndicator(color = blue)
            } else {
                val faceWidth = minOf(maxWidth - 15.dp, (maxHeight - 6.dp) * 0.75f)
                val faceHeight = minOf(maxHeight - 6.dp, faceWidth * (4f / 3f))
                Box(
                    modifier = Modifier.width(faceWidth).height(faceHeight)
                        .clip(RoundedCornerShape(20.dp))
                        .background(pastelColour(card.color))
                ) {
                    Crossfade(targetState = showingAnswer, label = "Card question and answer") { back ->
                        val markup = if (back) card.answer else card.question
                        val media = if (back) card.aImage else card.qImage
                        StudyCardFace(
                            markup, media,
                            if (back) lightenCardColour(card.color) else card.color
                        )
                    }
                    if (card.topic.isNotBlank()) {
                        Text(
                            card.topic, color = Color(0xFF101321), fontSize = 11.sp,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.align(Alignment.TopStart).padding(10.dp)
                                .clip(RoundedCornerShape(30.dp))
                                .background(Color.White.copy(alpha = 0.68f))
                                .padding(horizontal = 9.dp, vertical = 4.dp)
                        )
                    }
                }
                // Original .arrow.left and .arrow.right, floating half-way up
                // the card rather than occupying a separate horizontal row.
                Box(
                    modifier = Modifier.align(Alignment.CenterStart).size(36.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Color.Black.copy(alpha = 0.36f))
                        .clickable { move(-1) },
                    contentAlignment = Alignment.Center
                ) {
                    Text("◀", color = Color.White, fontSize = 16.sp)
                }
                Box(
                    modifier = Modifier.align(Alignment.CenterEnd).size(36.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Color.Black.copy(alpha = 0.36f))
                        .clickable { move(1) },
                    contentAlignment = Alignment.Center
                ) {
                    Text("▶", color = Color.White, fontSize = 16.sp)
                }
            }
        }

        // Original blue .show button: answer visible only while pressed.
        // A quick tap additionally locks/unlocks the answer for accessibility.
        Box(
            modifier = Modifier.fillMaxWidth().height(70.dp)
                .padding(horizontal = 30.dp, vertical = 9.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier.widthIn(max = 225.dp).fillMaxWidth().height(51.dp)
                    .clip(RoundedCornerShape(30.dp))
                    .background(if (selected != null) blue else Color(0xFF4A5276))
                    .pointerInput(selected?.id, locked) {
                        detectTapGestures(
                            onPress = {
                                if (selected != null) {
                                    showingAnswer = true
                                    tryAwaitRelease()
                                    if (!locked) showingAnswer = false
                                }
                            },
                            onLongPress = { /* keep the answer visible until release */ },
                            onTap = {
                                if (selected != null) {
                                    locked = !locked
                                    showingAnswer = locked
                                }
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (locked) "Answer locked — tap to hide"
                    else "Hold to Show Answer",
                    color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold
                )
            }
        }

        // The original four fixed bottom buttons. A single row with stable
        // heights and no Material button minimums that wrap the labels.
        Row(
            modifier = Modifier.fillMaxWidth().height(65.dp)
                .background(darkPanel)
                .padding(horizontal = 8.dp, vertical = 11.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            @Composable
            fun footer(label: String, shade: Color, active: Boolean = true, action: () -> Unit) {
                Box(
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (active) shade else Color(0xFF4A5276))
                        .clickable(enabled = active) { action() }
                        .padding(horizontal = 2.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        label, maxLines = 1, softWrap = false,
                        fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        color = if (shade == Color(0xFFF1C40F)) Color.Black else Color.White,
                        textAlign = TextAlign.Center
                    )
                }
            }
            footer("Understood", Color(0xFF2DBF6E), card != null) {
                card?.let { onMark(it.id, "understood") }
            }
            footer("Mastered", Color(0xFF2DBF6E), card != null) {
                card?.let { onMark(it.id, "mastered") }
            }
            footer("Delete", Color(0xFFE74C3C), card != null) {
                card?.let { lastDeleted = it.id to it.status; onMark(it.id, "deleted") }
            }
            footer("Undo", Color(0xFFF1C40F), lastDeleted != null) {
                lastDeleted?.let { (id, status) ->
                    onMark(id, status)
                    lastDeleted = null
                }
            }
        }
    }

    if (settingsOpen) {
        AlertDialog(
            onDismissRequest = { settingsOpen = false },
            title = { Text("Socratic tutor settings") },
            text = {
                Column(
                    Modifier.fillMaxWidth().heightIn(max = 440.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = tutorPrompt, onValueChange = onTutorPromptChange,
                        label = { Text("Editable reference-grounded tutor prompt") },
                        minLines = 4, modifier = Modifier.fillMaxWidth()
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(checked = speakTutorReplies, onCheckedChange = onSpeakTutorRepliesChange)
                        Text("Speak tutor replies", modifier = Modifier.padding(start = 10.dp))
                    }
                    Text("The answer stored on each card is Clara's marking reference, not a verified current guideline.",
                        style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = { settingsOpen = false }) { Text("Close") }
            }
        )
    }

    if (topicsOpen) {
        ModalBottomSheet(onDismissRequest = { topicsOpen = false }) {
            Column(Modifier.fillMaxWidth().heightIn(max = 600.dp).verticalScroll(rememberScrollState()).padding(16.dp)) {
                Text("Views", style = MaterialTheme.typography.titleLarge)
                listOf("remaining" to "To learn", "understood" to "Understood", "mastered" to "Mastered",
                    "all" to "All", "random" to "Shuffle").forEach { (key, label) ->
                    TextButton(onClick = { changeView(key); topicsOpen = false }) {
                        Text("$label  ·  ${if (key == "remaining") totalRemaining else if (key == "understood") totalUnderstood else if (key == "mastered") totalMastered else deck.cards.size}")
                    }
                }
                HorizontalDivider(Modifier.padding(vertical = 9.dp))
                Text("Topics", style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = { changeTopic("All topics"); topicsOpen = false }) { Text("All topics") }
                topics.forEach { name ->
                    val c = remember(deck, name) { deck.cards.count { it.topic == name } }
                    TextButton(onClick = { changeTopic(name); topicsOpen = false }) { Text("$name · $c") }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (editorOpen) {
        var question by remember(editorOpen, editingCard?.id) { mutableStateOf(TextFieldValue(editingCard?.question.orEmpty())) }
        var answer by remember(editorOpen, editingCard?.id) { mutableStateOf(TextFieldValue(editingCard?.answer.orEmpty())) }
        var editorTopic by remember(editorOpen, editingCard?.id) { mutableStateOf(editingCard?.topic.orEmpty()) }
        var color by remember(editorOpen, editingCard?.id) { mutableStateOf(editingCard?.color ?: "#f7f9ff") }
        var qSide by remember { mutableStateOf(true) }
        fun addTag(tag: String) {
            if (qSide) question = applyRichTag(question,tag)
            else answer = applyRichTag(answer,tag)
        }
        AlertDialog(
            onDismissRequest = { editorOpen = false },
            title = { Text(if (editingCard == null) "Add flashcard" else "Edit flashcard") },
            text = {
                Column(Modifier.fillMaxWidth().heightIn(max = 510.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Formatting", style = MaterialTheme.typography.labelMedium)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(selected = qSide, onClick = { qSide = true }, label = { Text("Question") })
                        FilterChip(selected = !qSide, onClick = { qSide = false }, label = { Text("Answer") })
                        listOf("b" to "B", "i" to "I", "u" to "U", "strong" to "Bold").forEach { (tag,label) ->
                            OutlinedButton(onClick = { addTag(tag) }) { Text(label) }
                        }
                    }
                    Text("Select text and apply B / I / U. Existing HTML formatting is preserved.",
                        style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(value = question, onValueChange = { question = it; qSide = true },
                        label = { Text("Question (rich HTML)") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                    OutlinedTextField(value = answer, onValueChange = { answer = it; qSide = false },
                        label = { Text("Answer (rich HTML)") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                    OutlinedTextField(value = editorTopic, onValueChange = { editorTopic = it },
                        label = { Text("Topic") }, modifier = Modifier.fillMaxWidth())
                    Text("Card colour")
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        CARD_COLORS.forEach { choice ->
                            Box(Modifier.size(29.dp).clip(RoundedCornerShape(50))
                                .background(pastelColour(choice))
                                .then(if (choice == color) Modifier.then(Modifier.padding(2.dp)) else Modifier)
                                .clickable { color = choice })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { pictureTarget = "q"; imagePicker.launch("image/*") }) { Text("Question image") }
                        OutlinedButton(onClick = { pictureTarget = "a"; imagePicker.launch("image/*") }) { Text("Answer image") }
                    }
                    if (pickedImageMessage.isNotBlank()) Text(pickedImageMessage)
                    Text("Image files are embedded in the local deck. Imported image data is retained.",
                        style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    if (question.text.isNotBlank() || answer.text.isNotBlank()) {
                        onSaveCard(ClaraStudyCard(
                            id = editingCard?.id ?: UUID.randomUUID().toString(),
                            question = question.text, answer = answer.text, topic = editorTopic.trim(),
                            qImage = draftQImage, aImage = draftAImage, color = color,
                            status = editingCard?.status ?: "remaining"))
                        editorOpen = false
                    }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { editorOpen = false }) { Text("Cancel") } }
        )
    }
}
