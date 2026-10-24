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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
html,body{min-height:100%;box-sizing:border-box;margin:0;background:$safeColor;color:#171C2C}html{height:100%}
body{font:18px system-ui,Roboto,sans-serif;line-height:1.6;text-align:left;padding:24px 22px;overflow-wrap:anywhere}h1,h2,h3{font-size:1.25em;line-height:1.4}b,strong{font-weight:650}*{box-sizing:border-box}
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
    isSpeaking: Boolean,
    speechReady: Boolean,
    speechMessage: String,
    onStopSpeech: () -> Unit,
    onVoiceSettings: () -> Unit,
    onModelSettings: () -> Unit,
    modelStatus: String,
    modelBusy: Boolean,
    tutorPrompt: String,
    onTutorPromptChange: (String) -> Unit,
    speakTutorReplies: Boolean,
    onSpeakTutorRepliesChange: (Boolean) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var view by rememberSaveable { mutableStateOf("remaining") }
    var topic by rememberSaveable { mutableStateOf("All topics") }
    var keyword by rememberSaveable { mutableStateOf("") }
    var keywordEnabled by rememberSaveable { mutableStateOf(false) }
    var index by rememberSaveable { mutableIntStateOf(0) }
    var number by rememberSaveable { mutableStateOf("1") }
    var showingAnswer by rememberSaveable { mutableStateOf(false) }
    var locked by rememberSaveable { mutableStateOf(false) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
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
    LaunchedEffect(selected?.id, showingAnswer) { onStopSpeech() }
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

    val pale = ClaraColors.text
    val muted = ClaraColors.muted
    val blue = ClaraColors.accent
    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(
        listOf(ClaraColors.background, Color(0xFF101827), ClaraColors.background)))) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 8.dp, top = 10.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { topicsOpen = true }) { ClaraGlyph("menu", "Topics and learning progress") }
            ClaraOrb(active = isSpeaking, modifier = Modifier.size(32.dp))
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Text("Clara", color = pale, fontSize = 23.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.6).sp)
                Text("YOUR STUDY COMPANION", color = muted, fontSize = 9.sp, letterSpacing = 1.4.sp)
            }
            IconButton(onClick = { searchOpen = !searchOpen }) { ClaraGlyph("search", "Search cards") }
            Box {
                IconButton(onClick = { optionsOpen = true }) { ClaraGlyph("more", "Card options") }
                DropdownMenu(expanded = optionsOpen, onDismissRequest = { optionsOpen = false }) {
                    @Composable fun action(name: String, enabled: Boolean = true, block: () -> Unit) {
                        DropdownMenuItem(text = { Text(name) }, enabled = enabled,
                            onClick = { optionsOpen = false; block() })
                    }
                    action("Import JSON") { onImport() }
                    action("Export JSON", deck.cards.isNotEmpty()) { onExport() }
                    action("Add flashcard") {
                        editingCard = null; draftQImage = ""; draftAImage = ""; editorOpen = true
                    }
                    action("Edit this card", card != null) {
                        editingCard = card; draftQImage = card?.qImage.orEmpty()
                        draftAImage = card?.aImage.orEmpty(); editorOpen = true
                    }
                    HorizontalDivider()
                    action("Tutor instructions") { settingsOpen = true }
                    action("Voice and reading speed") { onVoiceSettings() }
                    action("Model settings", !modelBusy) { onModelSettings() }
                    action("Shuffle cards", deck.cards.isNotEmpty()) { changeView("random") }
                    action("Open Clara chat") { onBack() }
                    action("Undo last deletion", lastDeleted != null) {
                        lastDeleted?.let { (id, status) -> onMark(id, status); lastDeleted = null }
                    }
                    action("Delete this card", card != null) {
                        card?.let { lastDeleted = it.id to it.status; onMark(it.id, "deleted") }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { topicsOpen = true }, contentPadding = PaddingValues(end = 8.dp)) {
                Text(topic, maxLines = 1, overflow = TextOverflow.Ellipsis, color = muted, fontSize = 13.sp,
                    modifier = Modifier.widthIn(max = 190.dp))
                Text("  ⌄", color = muted)
            }
            Spacer(Modifier.weight(1f))
            BasicTextField(value = number, onValueChange = { jumpTo(it) },
                modifier = Modifier.width(44.dp).heightIn(min = 36.dp)
                    .background(ClaraColors.surface, RoundedCornerShape(10.dp)).padding(vertical = 8.dp)
                    .semantics { contentDescription = "Jump to card number" },
                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = TextStyle(color = pale, fontSize = 13.sp, textAlign = TextAlign.Center))
            Text(" / ${shown.size}", color = muted, fontSize = 12.sp)
        }
        androidx.compose.animation.AnimatedVisibility(visible = searchOpen) {
            Row(Modifier.padding(horizontal = 18.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = keyword, onValueChange = { keyword = it; keywordEnabled = true; index = 0 },
                    modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(16.dp),
                    placeholder = { Text("Search question, answer or topic", fontSize = 12.sp) },
                    trailingIcon = { if (keyword.isNotEmpty()) IconButton(onClick = { keyword = "" }) {
                        ClaraGlyph("close", "Clear search")
                    } })
            }
        }
        if (keywordEnabled && keyword.isNotBlank() && !searchOpen) TextButton(
            onClick = { keyword = ""; keywordEnabled = false }, modifier = Modifier.padding(horizontal = 18.dp)) {
            Text("Search: $keyword  ×", maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (importMessage.isNotBlank()) {
            Text(importMessage, color = if (importError) Color(0xFFFFB4AB) else muted, fontSize = 11.sp,
                maxLines = 3, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        }
        Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp)) {
            if (selected == null) {
                Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center) {
                    ClaraOrb(active = false, modifier = Modifier.size(58.dp))
                    Spacer(Modifier.height(18.dp))
                    Text(if (deck.cards.isEmpty()) "Your next discovery starts here" else "No cards in this view", color = pale,
                        style = MaterialTheme.typography.titleMedium)
                    Text(if (deck.cards.isEmpty()) "Import your deck to study with Clara." else "Choose another topic or clear your search.",
                        color = muted, modifier = Modifier.padding(12.dp), textAlign = TextAlign.Center)
                    Button(onClick = if (deck.cards.isEmpty()) onImport else { {
                        keyword = ""; keywordEnabled = false; changeView("all")
                    } }) { Text(if (deck.cards.isEmpty()) "Import a deck" else "Show all cards") }
                }
            } else if (card == null) {
                CircularProgressIndicator(Modifier.align(Alignment.Center), color = blue)
            } else {
                Column(Modifier.fillMaxSize().clip(RoundedCornerShape(26.dp)).background(Color(0xFFF4F5FA))) {
                    // A separate header reserves real space for the topic; it never overlays the question.
                    Row(Modifier.fillMaxWidth().padding(start = 20.dp, top = 13.dp, end = 8.dp, bottom = 5.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(card.topic.ifBlank { "Flashcard" }, color = Color(0xFF525C74), fontSize = 11.sp,
                            fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f))
                        Text(if (showingAnswer) "ANSWER" else "QUESTION", color = Color(0xFF68728B),
                            fontSize = 9.sp, letterSpacing = 1.sp)
                        IconButton(onClick = {
                            if (isSpeaking) onStopSpeech() else onSpeak(cardPlainText(if (showingAnswer) card.answer else card.question))
                        }) { ClaraGlyph(if (isSpeaking) "stop" else "speaker", if (isSpeaking) "Stop reading" else "Read visible side",
                            tint = Color(0xFF425268)) }
                    }
                    Crossfade(targetState = "${card.id}:$showingAnswer", modifier = Modifier.weight(1f), label = "Card face") {
                        val back = it.endsWith(":true")
                        StudyCardFace(if (back) card.answer else card.question, if (back) card.aImage else card.qImage, "#F4F5FA")
                    }
                    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { move(-1) }) { ClaraGlyph("left", "Previous card", tint = Color(0xFF525C74)) }
                        Text("Take a moment to recall", color = Color(0xFF68728B), fontSize = 11.sp,
                            textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                        IconButton(onClick = { move(1) }) { ClaraGlyph("right", "Next card", tint = Color(0xFF525C74)) }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(onClick = { locked = !locked; showingAnswer = locked }, enabled = card != null,
                shape = RoundedCornerShape(16.dp), modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                colors = ButtonDefaults.filledTonalButtonColors(containerColor = ClaraColors.accent, contentColor = ClaraColors.background)) {
                Text(if (showingAnswer) "Hide answer" else "Reveal answer", fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(onClick = { if (isSpeaking) onStopSpeech() else card?.let {
                onSpeak(cardPlainText(if (showingAnswer) it.answer else it.question))
            } }, enabled = card != null, shape = RoundedCornerShape(16.dp), modifier = Modifier.heightIn(min = 48.dp)) {
                ClaraGlyph(if (isSpeaking) "stop" else "speaker", null, modifier = Modifier.size(18.dp))
                Text(if (isSpeaking) "  Stop" else "  Read aloud", fontSize = 12.sp)
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("understood" to "Understood", "mastered" to "Mastered").forEach { (key, label) ->
                TextButton(onClick = { card?.let { onMark(it.id, key) } }, enabled = card != null,
                    modifier = Modifier.weight(1f).heightIn(min = 42.dp)) {
                    ClaraGlyph("check", null, modifier = Modifier.size(15.dp), tint = ClaraColors.accent)
                    Text("  $label", color = muted, fontSize = 12.sp)
                }
            }
        }
        Surface(onClick = { card?.let { onDiscuss(it) } }, enabled = card != null && !modelBusy,
            shape = RoundedCornerShape(20.dp), color = ClaraColors.surface,
            border = BorderStroke(1.dp, ClaraColors.accent.copy(alpha = .22f)),
            modifier = Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = 10.dp)) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                ClaraOrb(active = modelBusy, modifier = Modifier.size(34.dp))
                Column(Modifier.weight(1f).padding(start = 11.dp)) {
                    Text("Talk to Clara", color = pale, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text(if (modelBusy) modelStatus else "Quiz me · discuss this card", color = muted, fontSize = 11.sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                ClaraGlyph("right", "Open Clara conversation", modifier = Modifier.size(18.dp))
            }
        }
        if (speechMessage.isNotBlank() || !speechReady) TextButton(onClick = onVoiceSettings,
            modifier = Modifier.fillMaxWidth().heightIn(min = 32.dp)) {
            Text(speechMessage.ifBlank { "Set up Clara's voice" }, fontSize = 11.sp, maxLines = 2)
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
