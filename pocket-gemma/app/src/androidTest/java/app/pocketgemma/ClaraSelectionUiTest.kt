package app.pocketgemma

import android.graphics.Rect
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.viewinterop.AndroidView
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** Verifies Android WebView can expose selected card text under its restrictive CSP. */
class ClaraSelectionUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun selectionBridgeReadsTextWithoutPageScripts() {
        val webRef = AtomicReference<ClaraSelectionWebView?>()
        val loaded = AtomicBoolean(false)
        val injected = AtomicReference("")
        val picked = AtomicReference("")

        compose.setContent {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    ClaraSelectionWebView(context) { picked.set(it) }.apply {
                        settings.javaScriptEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.blockNetworkLoads = true
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView?, url: String?) {
                                loaded.set(true)
                            }
                        }
                        loadDataWithBaseURL(
                            null,
                            """<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"></head><body><p id="passage">The selected medical statement.</p></body></html>""",
                            "text/html", "UTF-8", null
                        )
                        webRef.set(this)
                    }
                }
            )
        }

        compose.waitUntil(20000) { loaded.get() && webRef.get() != null }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webRef.get()!!.evaluateJavascript(
                """(function(){var p=document.getElementById('passage');var r=document.createRange();r.selectNodeContents(p);var s=window.getSelection();s.removeAllRanges();s.addRange(r);return s.toString();})()"""
            ) { injected.set(it) }
        }
        compose.waitUntil(10000) { injected.get().isNotEmpty() }
        assertTrue("Selection JS blocked by CSP: ${injected.get()}", injected.get().contains("selected medical statement"))

        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webRef.get()!!.startActionMode(object : ActionMode.Callback {
                override fun onCreateActionMode(mode: ActionMode?, menu: Menu?) = true
                override fun onPrepareActionMode(mode: ActionMode?, menu: Menu?) = false
                override fun onActionItemClicked(mode: ActionMode?, item: MenuItem?) = false
                override fun onDestroyActionMode(mode: ActionMode?) {}
            }, ActionMode.TYPE_FLOATING)
        }
        compose.waitUntil(10000) { picked.get().contains("selected medical statement") }
        assertTrue(picked.get().contains("selected medical statement"))
    }
}
