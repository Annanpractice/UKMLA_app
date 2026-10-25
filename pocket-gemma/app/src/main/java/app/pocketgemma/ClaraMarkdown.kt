package app.pocketgemma

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp
import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TableRow
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.jsoup.Jsoup

/**
 * Parse Gemma's response as CommonMark for display and speech.
 * Keep the original model output unchanged in saved messages. The output
 * parser is distinct from Gemma's internal turn/control-token protocol.
 */
object ClaraMarkdown {
    private val parser = Parser.builder().extensions(
        listOf(TablesExtension.create(), StrikethroughExtension.create())
    ).build()

    fun display(raw: String): AnnotatedString {
        if (raw.isBlank()) return AnnotatedString("")
        val out = AnnotatedString.Builder()

        fun lineBreak(blank: Boolean = false) {
            if (out.length == 0) return
            val current = out.toString()
            if (!current.endsWith("\n")) out.append("\n")
            if (blank && !out.toString().endsWith("\n\n")) out.append("\n")
        }

        fun renderChildren(node: Node, level: Int, render: (Node, Int) -> Unit) {
            var child = node.firstChild
            while (child != null) {
                render(child, level)
                child = child.next
            }
        }

        fun render(node: Node, level: Int) {
            when (node) {
                is org.commonmark.node.Text -> out.append(node.literal)
                is Code -> {
                    val start = out.length
                    out.append(node.literal)
                    out.addStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = Color(0xFFD8D5FA)), start, out.length)
                }
                is FencedCodeBlock -> {
                    lineBreak()
                    val start = out.length
                    out.append(node.literal.trimEnd('\n'))
                    out.addStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = Color(0xFFD8D5FA)), start, out.length)
                    lineBreak(blank = true)
                }
                is IndentedCodeBlock -> {
                    lineBreak()
                    val start = out.length
                    out.append(node.literal.trimEnd('\n'))
                    out.addStyle(SpanStyle(fontFamily = FontFamily.Monospace), start, out.length)
                    lineBreak(blank = true)
                }
                is SoftLineBreak -> out.append(" ")
                is HardLineBreak -> out.append("\n")
                is Heading -> {
                    lineBreak()
                    val start = out.length
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    out.addStyle(
                        SpanStyle(fontWeight = FontWeight.Bold, fontSize = (22 - node.level * 2).coerceAtLeast(14).sp),
                        start, out.length
                    )
                    lineBreak(blank = true)
                }
                is StrongEmphasis -> {
                    val start = out.length
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    out.addStyle(SpanStyle(fontWeight = FontWeight.Bold), start, out.length)
                }
                is Emphasis -> {
                    val start = out.length
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    out.addStyle(SpanStyle(fontStyle = FontStyle.Italic), start, out.length)
                }
                is Strikethrough -> {
                    val start = out.length
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    out.addStyle(SpanStyle(textDecoration = TextDecoration.LineThrough), start, out.length)
                }
                is Link -> {
                    val start = out.length
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    out.addStyle(
                        SpanStyle(color = Color(0xFF9CE8D8), textDecoration = TextDecoration.Underline),
                        start, out.length
                    )
                }
                is BulletList -> {
                    lineBreak()
                    var item = node.firstChild
                    while (item != null) {
                        out.append("  ".repeat(level.coerceAtMost(5)) + "•  ")
                        renderChildren(item, level + 1) { child, depth -> render(child, depth) }
                        lineBreak()
                        item = item.next
                    }
                    lineBreak()
                }
                is OrderedList -> {
                    lineBreak()
                    var item = node.firstChild
                    var number = node.startNumber
                    while (item != null) {
                        out.append("  ".repeat(level.coerceAtMost(5)) + number.toString() + ".  ")
                        renderChildren(item, level + 1) { child, depth -> render(child, depth) }
                        lineBreak()
                        number++
                        item = item.next
                    }
                    lineBreak()
                }
                is Paragraph -> {
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    if (node.parent !is ListItem && node.parent !is TableCell) lineBreak(blank = true)
                }
                is BlockQuote -> {
                    lineBreak()
                    out.append("│  ")
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    lineBreak(blank = true)
                }
                is TableRow -> {
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    lineBreak()
                }
                is TableCell -> {
                    renderChildren(node, level) { child, depth -> render(child, depth) }
                    if (node.next != null) out.append("    •    ")
                }
                is HtmlInline -> out.append(Jsoup.parseBodyFragment(node.literal).text())
                is HtmlBlock -> {
                    out.append(Jsoup.parseBodyFragment(node.literal).text())
                    lineBreak()
                }
                is ThematicBreak -> {
                    lineBreak()
                    out.append("────────")
                    lineBreak(blank = true)
                }
                else -> renderChildren(node, level) { child, depth -> render(child, depth) }
            }
        }
        render(parser.parse(raw), 0)
        return out.toAnnotatedString()
    }

    /**
     * Traverse the Markdown AST to remove *syntax*, not meaningful medical
     * information. Link labels and image alt text remain; raw URLs and fenced
     * code language labels are excluded. Mathematical signs are verbalised.
     */
    fun speech(raw: String): String {
        if (raw.isBlank()) return ""
        val out = StringBuilder()
        fun visit(node: Node) {
            when (node) {
                is org.commonmark.node.Text -> out.append(node.literal)
                is Code -> out.append(node.literal)
                is FencedCodeBlock -> out.append(node.literal).append("\n")
                is IndentedCodeBlock -> out.append(node.literal).append("\n")
                is SoftLineBreak, is HardLineBreak -> out.append(" ")
                is HtmlInline -> out.append(Jsoup.parseBodyFragment(node.literal).text())
                is HtmlBlock -> out.append(Jsoup.parseBodyFragment(node.literal).text()).append("\n")
                is ThematicBreak -> out.append("\n")
                is TableCell -> {
                    var c = node.firstChild
                    while (c != null) { visit(c); c = c.next }
                    if (node.next != null) out.append(", ")
                }
                else -> {
                    var c = node.firstChild
                    while (c != null) { visit(c); c = c.next }
                    if (node is Paragraph || node is Heading || node is ListItem || node is TableRow) out.append("\n")
                }
            }
        }
        visit(parser.parse(raw))
        return normaliseSpeech(out.toString())
    }

    private fun normaliseSpeech(input: String): String {
        var text = input
        // Common LaTeX commands occasionally generated alongside Markdown.
        text = text.replace(Regex("""\\frac\{([^{}]+)\}\{([^{}]+)\}"""), "$1 over $2")
        text = text.replace(Regex("""\\sqrt\{([^{}]+)\}"""), "square root of $1")
        text = text.replace(Regex("""\\(?:text|mathrm|mathbf|operatorname)\{([^{}]+)\}"""), "$1")
        text = text.replace(Regex("""\\(?:rightarrow|longrightarrow|Rightarrow|to)\b"""), " to ")
        text = text.replace(Regex("""\\(?:leq|le|leqslant)\b"""), " less than or equal to ")
        text = text.replace(Regex("""\\(?:geq|ge|geqslant)\b"""), " greater than or equal to ")
        text = text.replace(Regex("""\\(?:times|cdot)\b"""), " times ")
        text = text.replace(Regex("""\\[\(\)\[\]]"""), " ")
        // A closed pair is a maths delimiter, not a currency expression.
        text = text.replace(Regex("""\$(\d+(?:\.\d+)?)\$"""), "$1")
        text = text.replace(Regex("""\$(\d+(?:\.\d+)?)"""), "$1 dollars")
        text = text.replace("→", " to ").replace("⇒", " therefore ").replace("←", " from ")
        text = text.replace("->", " to ").replace("<-", " from ")
        text = text.replace("≤", " less than or equal to ")
            .replace("≥", " greater than or equal to ")
            .replace("≠", " not equal to ")
            .replace("±", " plus or minus ")
            .replace("<", " less than ").replace(">", " greater than ")
        text = text.replace("×", " times ").replace("÷", " divided by ")
        text = text.replace(Regex("""(?<=\d)\s*\*\s*(?=\d)"""), " times ")
        text = text.replace("%", " percent ")
        // Leave drug doses, numbers, medical terms and their units intact.
        text = text.replace(Regex("""(?i)\b(mg|mcg|µg|g|ml|mmol|units)/(?=kg|ml|l|day|hour|min)\b"""), "$1 per ")
        text = text.replace(Regex("""\^([0-9]+)"""), " to the power of $1 ")
        text = text.replace(Regex("""[{}$\\]"""), " ")
        text = text.replace(Regex("""[ \t]+"""), " ")
        text = text.replace(Regex(""" *\n+ *"""), ". ")
        text = text.replace(Regex("""(?:\.\s*){2,}"""), ". ")
        return text.trim().trimEnd('.').trim() + if (text.isBlank()) "" else "."
    }
}
