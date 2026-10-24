package app.pocketgemma

import android.content.Context
import android.net.Uri
import android.text.Html
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.util.UUID

data class ClaraStudyCard(
    val id: String,
    val question: String,
    val answer: String,
    val topic: String,
    val qImage: String = "",
    val aImage: String = "",
    val status: String = "remaining"
)

data class ClaraStudyDeck(val cards: List<ClaraStudyCard> = emptyList())

fun cardPlainText(html: String): String =
    Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT).toString().replace(Regex("\\s+"), " ").trim()

object ClaraDeckStorage {
    private const val MAX_IMPORT = 100L * 1024 * 1024
    private fun deckFile(context: Context) = File(context.filesDir, "clara-flashcards.json")
    fun load(context: Context): ClaraStudyDeck = runCatching {
        val file = deckFile(context)
        if (file.isFile) parse(file.readText(Charsets.UTF_8)) else ClaraStudyDeck()
    }.getOrDefault(ClaraStudyDeck())

    fun importLocal(context: Context, uri: Uri): ClaraStudyDeck {
        val bytes = context.contentResolver.openInputStream(uri)?.use { stream ->
            val buffer = ByteArray(8192)
            val output = java.io.ByteArrayOutputStream()
            var size = 0L
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) break
                size += count
                require(size <= MAX_IMPORT) { "Deck is too large (100 MB limit)." }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: error("Cannot read the selected deck.")
        val parsed = parse(bytes.toString(Charsets.UTF_8))
        require(parsed.cards.isNotEmpty()) { "No cards were found in this JSON deck." }
        save(context, parsed)
        return parsed
    }

    private fun parse(json: String): ClaraStudyDeck {
        val root = JSONTokener(json.trimStart('\uFEFF')).nextValue()
        val collected = mutableListOf<ClaraStudyCard>()
        val ids = mutableSetOf<String>()
        fun read(array: JSONArray?, status: String) {
            if (array == null) return
            require(array.length() <= 20000) { "Deck exceeds 20,000 cards." }
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                val q = obj.optString("q", obj.optString("Question", obj.optString("question", "")))
                val a = obj.optString("a", obj.optString("Answer", obj.optString("answer", "")))
                if (q.isBlank() && a.isBlank()) continue
                val originalId = obj.optString("id", "").ifBlank { UUID.randomUUID().toString() }
                val uniqueId = if (ids.add(originalId)) originalId else UUID.randomUUID().toString().also { ids.add(it) }
                val actualStatus = if (status == "remaining") obj.optString("status", status) else status
                collected.add(ClaraStudyCard(
                    id = uniqueId,
                    question = q,
                    answer = a,
                    topic = obj.optString("topic", ""),
                    qImage = obj.optString("qImg", obj.optString("QImage", "")),
                    aImage = obj.optString("aImg", obj.optString("AImage", "")),
                    status = if (actualStatus in setOf("remaining","understood","mastered")) actualStatus else "remaining"
                ))
            }
        }
        when (root) {
            is JSONArray -> read(root, "remaining")
            is JSONObject -> {
                read(root.optJSONArray("cards"), "remaining")
                read(root.optJSONArray("understood") ?: root.optJSONArray("seen"), "understood")
                read(root.optJSONArray("mastered"), "mastered")
            }
            else -> error("Expected a JSON deck or an array of cards.")
        }
        return ClaraStudyDeck(collected)
    }

    fun save(context: Context, deck: ClaraStudyDeck) {
        val groups = JSONObject()
        for (status in listOf("remaining","understood","mastered")) {
            val a = JSONArray()
            deck.cards.filter { it.status == status }.forEach { c ->
                a.put(JSONObject().put("id", c.id).put("q", c.question).put("a", c.answer)
                    .put("topic", c.topic).put("qImg", c.qImage).put("aImg", c.aImage))
            }
            groups.put(status, a)
        }
        val target = deckFile(context)
        val tmp = File(context.filesDir, "clara-flashcards.tmp")
        tmp.writeText(groups.toString(), Charsets.UTF_8)
        require(tmp.renameTo(target) || run {
            tmp.copyTo(target, overwrite = true)
            tmp.delete()
            true
        }) { "Could not save imported cards." }
    }
}

// Displays locally imported formatting and data-URI images without JavaScript,
// disk access, Android bridges, or external network requests.
@Composable
private fun StudyCardFace(html: String, imageData: String) {
    val context = LocalContext.current
    val document = remember(html, imageData) {
        val safeImg = if (imageData.startsWith("data:image/") && imageData.length <= 12_000_000)
            "<p><img src=\"" + imageData.replace("\"", "") + "\" /></p>" else ""
        """<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>html,body{background:#21252b;color:#f1f4f7;font:17px system-ui,sans-serif;line-height:1.5;margin:0;padding:4px}
img{max-width:100%;height:auto}table{max-width:100%;overflow:auto}a{color:#9ecaff}
p{margin:7px 0}ul{padding-left:22px}</style></head><body>""" + html + safeImg + "</body></html>"
    }
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                setBackgroundColor(android.graphics.Color.rgb(33,37,43))
                settings.javaScriptEnabled = false
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.blockNetworkLoads = true
                settings.setSupportMultipleWindows(false)
                webViewClient = WebViewClient()
                loadDataWithBaseURL(null, document, "text/html", "UTF-8", null)
            }
        },
        update = { view -> if (view.tag != document) { view.tag = document; view.loadDataWithBaseURL(null, document, "text/html", "UTF-8", null) } },
        modifier = Modifier.fillMaxWidth().height(230.dp)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClaraFlashcardScreen(
    deck: ClaraStudyDeck,
    onBack: () -> Unit,
    onImport: () -> Unit,
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
    var selectedTopic by remember { mutableStateOf("All topics") }
    var filter by remember { mutableStateOf("remaining") }
    var index by remember { mutableIntStateOf(0) }
    var showAnswer by remember { mutableStateOf(false) }
    var topicExpanded by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    val topics = remember(deck) { listOf("All topics") + deck.cards.map { it.topic }.filter { it.isNotBlank() }.distinct().sorted() }
    val shown = remember(deck, selectedTopic, filter) {
        deck.cards.filter { (selectedTopic == "All topics" || it.topic == selectedTopic) &&
            (filter == "all" || it.status == filter) }
    }
    LaunchedEffect(deck, selectedTopic, filter) {
        if (index >= shown.size) index = (shown.size - 1).coerceAtLeast(0)
        if (index < 0) index = 0
        showAnswer = false
    }
    val card = shown.getOrNull(index)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onBack) { Text("Back to Clara") }
            Text("Study cards", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            TextButton(onClick = onImport) { Text("Import") }
        }
        if (importMessage.isNotEmpty()) Text(importMessage)
        Text("${deck.cards.size} cards · ${deck.cards.count { it.status == "remaining" }} remaining · ${deck.cards.count { it.status == "understood" }} understood · ${deck.cards.count { it.status == "mastered" }} mastered",
            style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            listOf("remaining" to "To learn", "all" to "All", "understood" to "Understood", "mastered" to "Mastered").forEach { (key, label) ->
                FilterChip(selected = filter == key, onClick = { filter = key; index = 0 }, label = { Text(label) })
            }
        }
        Box {
            OutlinedButton(onClick = { topicExpanded = true }) { Text("Topic: $selectedTopic") }
            DropdownMenu(expanded = topicExpanded, onDismissRequest = { topicExpanded = false }) {
                topics.forEach { topic ->
                    DropdownMenuItem(text = { Text(topic) }, onClick = {
                        selectedTopic = topic
                        index = 0
                        topicExpanded = false
                    })
                }
            }
        }
        if (card == null) {
            if (deck.cards.isEmpty()) {
                Text("No flashcards imported yet.", style = MaterialTheme.typography.titleMedium)
                Text("Choose your original flashcards.json or .cards file from this phone. The deck is saved locally.")
                Button(
                    onClick = onImport,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Import flashcard deck") }
            } else {
                Text("No cards match this filter. Try All or another topic.")
                OutlinedButton(onClick = { filter = "all"; selectedTopic = "All topics"; index = 0 }) {
                    Text("Show all cards")
                }
            }
        } else {
            Text("Card ${index+1} / ${shown.size} · ${card.topic.ifBlank { "Uncategorised" }}",
                style = MaterialTheme.typography.labelMedium)
            Text("Question", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            StudyCardFace(card.question, card.qImage)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    onSpeak(cardPlainText(card.question))
                }) { Text("Speak question") }
                Button(onClick = { showAnswer = !showAnswer }) {
                    Text(if (showAnswer) "Hide answer" else "Reveal answer")
                }
            }
            if (showAnswer) {
                Text("Answer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                StudyCardFace(card.answer, card.aImage)
                OutlinedButton(onClick = { onSpeak(cardPlainText(card.answer)) }) { Text("Speak answer") }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onMark(card.id,"understood") }) { Text("Understood") }
                    Button(onClick = { onMark(card.id,"mastered") }) { Text("Mastered") }
                    TextButton(onClick = { onMark(card.id,"remaining") }) { Text("Again") }
                }
            }
            Button(onClick = { onDiscuss(card) }, modifier = Modifier.fillMaxWidth()) { Text("Discuss this card with Clara") }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(enabled = index > 0, onClick = { index--; showAnswer = false }) { Text("Previous") }
                OutlinedButton(enabled = index < shown.lastIndex, onClick = { index++; showAnswer = false }) { Text("Next") }
            }
        }
        HorizontalDivider()
        OutlinedButton(onClick = { settingsOpen = !settingsOpen }) { Text(if (settingsOpen) "Hide teaching settings" else "Teaching settings") }
        if (settingsOpen) {
            Text("Clara's Socratic teaching instructions", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(value = tutorPrompt, onValueChange = onTutorPromptChange,
                modifier = Modifier.fillMaxWidth(), minLines = 4, maxLines = 10,
                label = { Text("Editable teaching prompt") })
            Row {
                Switch(checked = speakTutorReplies, onCheckedChange = onSpeakTutorRepliesChange)
                Spacer(Modifier.width(10.dp))
                Text("Speak Clara's tutor replies", modifier = Modifier.weight(1f))
            }
            Text("The supplied answer is private context for the local model. Clara is instructed not to reveal it before you ask or attempt an answer.",
                style = MaterialTheme.typography.bodySmall)
        }
    }
}
