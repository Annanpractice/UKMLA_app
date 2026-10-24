package app.pocketgemma

import android.content.Context
import android.net.Uri
import android.text.Html
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
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

data class ClaraStudyDeck(val cards: List<ClaraStudyCard> = emptyList())

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
html,body{min-height:100%;box-sizing:border-box;margin:0;background:$safeColor;color:#101321}
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

    LaunchedEffect(keyword, deck) {
        if (keyword.isBlank()) { searchHits = emptySet(); searchLoading = false }
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
    val shown = remember(ordered, view, topic, keyword, searchHits, searchLoading) {
        ordered.filter { c ->
            (view == "all" || view == "random" || c.status == view) &&
            (topic == "All topics" || c.topic == topic) &&
            (keyword.isBlank() || (c.id in searchHits && !searchLoading))
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
    val cardState = produceState<ClaraStudyCard?>(initialValue = null, key1 = selected?.id) {
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

    Column(Modifier.fillMaxSize().background(Color(0xFF0E1222))) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(8.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            TextButton(onClick = onBack) { Text("‹ Clara") }
            TextButton(onClick = { topicsOpen = true }) { Text("☰ Topics") }
            OutlinedButton(onClick = onImport) { Text("Import") }
            OutlinedButton(onClick = onExport, enabled = deck.cards.isNotEmpty()) { Text("Export JSON") }
            OutlinedButton(onClick = { editingCard = null; draftQImage = ""; draftAImage = ""; editorOpen = true },
                enabled = true) { Text("Add") }
            OutlinedButton(onClick = { editingCard = card; draftQImage = card?.qImage.orEmpty()
                draftAImage = card?.aImage.orEmpty(); editorOpen = true }, enabled = card != null) { Text("Edit") }
            TextButton(onClick = { settingsOpen = !settingsOpen }) { Text("Tutor settings") }
        }
        if (importMessage.isNotBlank()) {
            Text(importMessage, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 3.dp),
                color = if (importError) Color(0xFFFF9D9D) else Color(0xFFB9D8FF))
        }
        Text("$totalRemaining remaining  ·  $totalUnderstood understood  ·  $totalMastered mastered",
            color = Color(0xFFC5CBE0), style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("remaining" to "To learn", "understood" to "Understood", "mastered" to "Mastered",
                "all" to "All", "random" to "Shuffle").forEach { (key, label) ->
                FilterChip(selected = view == key, onClick = { changeView(key) }, label = { Text(label) })
            }
        }
        OutlinedTextField(
            value = keyword,
            onValueChange = { keyword = it; index = 0 },
            singleLine = true,
            placeholder = { Text("Search question, answer or topic") },
            trailingIcon = { if (keyword.isNotEmpty()) TextButton(onClick = { keyword = "" }) { Text("Clear") } },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp)
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(topic, color = Color(0xFFC5CBE0), modifier = Modifier.weight(1f), maxLines = 1)
            Text("Card", color = Color(0xFFC5CBE0))
            OutlinedTextField(
                value = number, onValueChange = { jumpTo(it) },
                modifier = Modifier.width(69.dp).padding(start = 6.dp),
                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            Text(" / ${shown.size}", color = Color(0xFFF4F6FB))
        }
        if (settingsOpen) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(value = tutorPrompt, onValueChange = onTutorPromptChange,
                    label = { Text("Socratic tutor — editable instructions") },
                    modifier = Modifier.fillMaxWidth(), minLines = 4, maxLines = 7)
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Switch(checked = speakTutorReplies, onCheckedChange = onSpeakTutorRepliesChange)
                    Text("Speak tutor replies", modifier = Modifier.padding(start = 12.dp))
                }
            }
        }
        if (selected == null) {
            Column(Modifier.weight(1f).padding(18.dp), verticalArrangement = Arrangement.Center,
                horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                Text(if (deck.cards.isEmpty()) "No flashcards loaded yet" else "No matching cards",
                    style = MaterialTheme.typography.titleLarge, color = Color.White)
                Spacer(Modifier.height(16.dp))
                Button(onClick = if (deck.cards.isEmpty()) onImport else { { keyword = ""; changeView("all") } }) {
                    Text(if (deck.cards.isEmpty()) "Import flashcard deck" else "Show all cards")
                }
            }
        } else if (card == null) {
            Box(Modifier.weight(1f), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
                contentAlignment = androidx.compose.ui.Alignment.Center) {
                Box(Modifier.fillMaxWidth().aspectRatio(0.75f)
                    .clip(RoundedCornerShape(20.dp)).background(pastelColour(card.color))) {
                    Crossfade(targetState = showingAnswer, label = "Flashcard flip") { back ->
                        val base = if (back) card.answer else card.question
                        val media = if (back) card.aImage else card.qImage
                        // Legacy HTML is shown intact, including colours,
                        // bold, italic, underline, tables and embedded images.
                        StudyCardFace(base, media, card.color)
                    }
                    Text(card.topic.ifBlank { "Uncategorised" },
                        style = MaterialTheme.typography.labelSmall, color = Color(0xFF101321),
                        modifier = Modifier.align(androidx.compose.ui.Alignment.TopStart)
                            .padding(12.dp).clip(RoundedCornerShape(40.dp))
                            .background(Color.White.copy(alpha = 0.78f)).padding(horizontal = 10.dp, vertical = 5.dp))
                    if (showingAnswer) {
                        Text("ANSWER", color = Color(0xFF34465C),
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.align(androidx.compose.ui.Alignment.BottomEnd).padding(14.dp))
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = { move(-1) }) { Text("◀") }
                Button(
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp)
                        .pointerInput(selected.id, locked) {
                            detectTapGestures(
                                onPress = {
                                    showingAnswer = true
                                    tryAwaitRelease()
                                    if (!locked) showingAnswer = false
                                },
                                onTap = { showingAnswer = !showingAnswer }
                            )
                        },
                    onClick = { showingAnswer = !showingAnswer }
                ) { Text(if (showingAnswer) "Hide / hold answer" else "Hold to reveal / tap to flip") }
                OutlinedButton(onClick = { move(1) }) { Text("▶") }
            }
            if (showingAnswer) {
                TextButton(onClick = { locked = !locked; if (!locked) showingAnswer = false },
                    modifier = Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally)) {
                    Text(if (locked) "Answer locked · tap to hide" else "Lock answer open")
                }
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                OutlinedButton(onClick = { onSpeak(cardPlainText(card.question)) }) { Text("🔊 Question") }
                OutlinedButton(onClick = { onSpeak(cardPlainText(card.answer)) }) { Text("🔊 Answer") }
                Button(onClick = { onDiscuss(card) }) { Text("Discuss with Clara") }
            }
            Row(Modifier.fillMaxWidth().padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Button(onClick = { onMark(card.id, "understood") }, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2DBF6E))) {
                    Text("Understood", color = Color.White)
                }
                Button(onClick = { onMark(card.id, "mastered") }, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1689BD))) {
                    Text("Mastered", color = Color.White)
                }
                Button(onClick = { lastDeleted = card.id to card.status; onMark(card.id,"deleted") },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE74C3C))) { Text("Delete") }
                Button(onClick = {
                    lastDeleted?.let { (id, status) -> onMark(id, status); lastDeleted = null }
                }, enabled = lastDeleted != null,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF1C40F))) {
                    Text("Undo", color = Color.Black)
                }
            }
        }
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
