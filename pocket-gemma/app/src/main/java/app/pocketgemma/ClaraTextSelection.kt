package app.pocketgemma

import android.content.Context
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebView
import org.json.JSONArray
import org.jsoup.Jsoup
import org.jsoup.safety.Safelist

/**
 * A text-selection bridge for the locally rendered flashcard HTML.
 *
 * There is NO JavaScript-to-Android bridge. Native code reads only the text
 * currently highlighted with window.getSelection(); it never runs scripts
 * supplied by a card. All imported HTML is sanitized before rendering, and
 * CSP blocks page scripts / network resource access.
 */
internal class ClaraSelectionWebView(
    context: Context,
    var onPassageSelected: (String) -> Unit
) : WebView(context) {
    private var lastSelection = ""

    private fun readSelection() {
        evaluateJavascript("(function(){return window.getSelection().toString()})()") { encoded ->
            val selection = runCatching { JSONArray("[" + encoded + "]").getString(0) }
                .getOrDefault("").trim().take(10000)
            if (selection.isNotBlank() && selection != lastSelection) {
                lastSelection = selection
                onPassageSelected(selection)
            }
        }
    }

    private fun decoratedCallback(inner: ActionMode.Callback): ActionMode.Callback2 =
        object : ActionMode.Callback2() {
            override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
                val accepted = inner.onCreateActionMode(mode, menu)
                if (accepted) {
                    lastSelection = ""
                    // A selection is available after the floating selection
                    // mode is created. Let Chromium finish positioning handles.
                    postDelayed({ readSelection() }, 180L)
                }
                return accepted
            }

            override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
                // Chromium still owns the stock Copy / Select all / Share menu.
                return inner.onPrepareActionMode(mode, menu)
            }

            override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean =
                inner.onActionItemClicked(mode, item)

            override fun onDestroyActionMode(mode: ActionMode) {
                inner.onDestroyActionMode(mode)
            }

            override fun onGetContentRect(mode: ActionMode, view: android.view.View, outRect: android.graphics.Rect) {
                if (inner is ActionMode.Callback2) inner.onGetContentRect(mode, view, outRect)
                else super.onGetContentRect(mode, view, outRect)
            }
        }

    override fun startActionMode(callback: ActionMode.Callback?): ActionMode? =
        if (callback == null) super.startActionMode(null)
        else super.startActionMode(decoratedCallback(callback))

    override fun startActionMode(callback: ActionMode.Callback?, type: Int): ActionMode? =
        if (callback == null) super.startActionMode(null, type)
        else super.startActionMode(decoratedCallback(callback), type)
}

internal fun sanitizeFlashcardHtml(input: String): String {
    // Retain normal card formatting, images, lists and tables, but strip
    // scripts, event-handler attributes, frames and executable markup.
    val safe = Safelist.relaxed()
        .addTags("div", "span", "figure", "figcaption", "h1", "h2", "h3", "h4", "section", "mark")
        .addAttributes(":all", "style", "class")
        .addProtocols("img", "src", "data")
    return Jsoup.clean(input, safe)
}
