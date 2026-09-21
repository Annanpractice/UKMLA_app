package uk.co.ukmla.reader

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.speech.tts.TextToSpeech
import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.*
import java.io.File
import java.util.concurrent.Executors
import java.util.Locale

class MainActivity : Activity() {
    companion object {
        private val worker=Executors.newSingleThreadExecutor()
        private var loaded=false
        private const val MODEL_URL="https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf?download=true"
    }
    private lateinit var store: CardStore
    private var tts: TextToSpeech?=null
    private var ttsReady=false
    private val bgTop=Color.rgb(24,38,60)
    private val bgBottom=Color.rgb(41,69,104)
    private val panel=Color.rgb(12,23,39)
    private val textPrimary=Color.rgb(247,249,252)
    private val textMuted=Color.rgb(185,199,218)
    private val accent=Color.rgb(242,200,121)
    private val border=Color.argb(48,227,235,247)
    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private lateinit var content: LinearLayout
    private var busy=false
    private var selection=""
    private var sources=listOf<Source>()
    private var summary=false
    private val history=mutableListOf<Pair<String,String>>()
    @Volatile private var cancelled=false
    private val modelFile get()=File(filesDir,"reader-model.gguf")
    private fun dp(x:Int)=(x*resources.displayMetrics.density).toInt()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor=bgTop
        window.navigationBarColor=bgTop
        initTts()
        store=CardStore(this)
        root=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(dp(18),dp(12),dp(18),dp(8))
            background=GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(bgTop,Color.rgb(33,54,84),bgBottom))
        }
        root.setOnApplyWindowInsetsListener { v, insets -> v.setPadding(dp(18),insets.systemWindowInsetTop+dp(8),dp(18),insets.systemWindowInsetBottom+dp(8)); insets }
        setContentView(root)
        root.addView(label("UKMLA",12f).apply { setTextColor(accent); typeface=Typeface.DEFAULT_BOLD; letterSpacing=.14f })
        root.addView(label("Offline reader",28f).apply { typeface=Typeface.DEFAULT_BOLD })
        status=label("",13f).apply {
            setTextColor(textMuted)
            background=shape(Color.argb(34,255,255,255),16)
            setPadding(dp(12),dp(8),dp(12),dp(8))
        }
        root.addView(status); updateStatus()
        val nav=LinearLayout(this)
        nav.addView(button("Cards & search") { if(!busy) home() },LinearLayout.LayoutParams(0,-2,1f))
        nav.addView(button("Model & info") { settings() },LinearLayout.LayoutParams(0,-2,1f));root.addView(nav)
        val scroller=ScrollView(this); content=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL }
        scroller.addView(content);root.addView(scroller,LinearLayout.LayoutParams(-1,0,1f))
        val external=intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
        if(!external.isNullOrBlank()) explain(external,false,null) else home()
    }
    override fun onDestroy() {
        cancelled=true
        Native.cancel()
        tts?.stop()
        tts?.shutdown()
        store.close()
        super.onDestroy()
    }
    private fun shape(fill:Int,radius:Int,stroke:Int?=border)=GradientDrawable().apply {
        setColor(fill);cornerRadius=dp(radius).toFloat();stroke?.let { setStroke(dp(1),it) }
    }
    private fun label(text:String,size:Float=16f)=TextView(this).apply {
        this.text=text;textSize=size;setTextColor(textPrimary);setPadding(0,dp(8),0,dp(8))
    }
    private fun muted(text:String,size:Float=14f)=label(text,size).apply { setTextColor(textMuted) }
    private fun button(text:String,action:()->Unit)=Button(this).apply {
        this.text=text;isAllCaps=false;textSize=14f;setTextColor(textPrimary);typeface=Typeface.DEFAULT_BOLD
        background=shape(Color.argb(25,255,255,255),16)
        setPadding(dp(14),dp(10),dp(14),dp(10));minHeight=dp(48)
        setOnClickListener { action() }
    }
    private fun inputField(hintText:String,max:Int)=EditText(this).apply {
        hint=hintText;maxLines=max;setTextColor(textPrimary);setHintTextColor(textMuted)
        background=shape(Color.argb(24,255,255,255),16);setPadding(dp(14),dp(12),dp(14),dp(12))
    }
    private fun initTts() {
        tts=TextToSpeech(this) { code ->
            if(code==TextToSpeech.SUCCESS) {
                tts?.let { engine ->
                    val local=Locale.getDefault()
                    val offline=engine.voices.orEmpty().filter { !it.isNetworkConnectionRequired }
                    val voice=offline.firstOrNull { it.locale==local }
                        ?: offline.firstOrNull { it.locale.language==local.language }
                        ?: offline.firstOrNull { it.locale==Locale.UK }
                        ?: offline.firstOrNull { it.locale.language=="en" }
                    if(voice!=null) {
                        engine.voice=voice
                        engine.setSpeechRate(.95f)
                        ttsReady=true
                    }
                }
            }
        }
    }
    private fun speak(text:String) {
        if(!ttsReady) {
            Toast.makeText(this,"No offline text-to-speech voice is installed or ready on this phone.",Toast.LENGTH_LONG).show()
            return
        }
        val spoken=text.replace(Regex("\\s*\\[\\d+\\]"),"").replace("**","")
        tts?.speak(spoken,TextToSpeech.QUEUE_FLUSH,null,"ukmla-answer")
    }
    private fun audioControls(answer:String)=LinearLayout(this).apply {
        orientation=LinearLayout.HORIZONTAL
        val speak=button("▶  Read answer") { speak(answer) }
        val stop=button("■  Stop") { tts?.stop() }
        addView(speak,LinearLayout.LayoutParams(0,-2,1f).apply { marginEnd=dp(5) })
        addView(stop,LinearLayout.LayoutParams(0,-2,1f).apply { marginStart=dp(5) })
    }
    private fun updateStatus(message:String?=null) { status.text=message ?: if(modelFile.exists()) "Offline • Model imported • Answers may be inaccurate" else "Offline cards & glossary ready • Import a model for AI" }
    private fun home() {
        content.removeAllViews(); history.clear()
        content.addView(label("Look up a term or explore your cards",21f).apply { typeface=Typeface.DEFAULT_BOLD })
        content.addView(muted("Search 1–3 words for definitions. Select a passage on any card to Explain or Summarise.",14f))
        val input=inputField("e.g. ataxia, heart failure, raised JVP",3)
        content.addView(input)
        val results=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL }
        fun show(items:List<Source>) {
            results.removeAllViews()
            items.take(100).forEach { s -> results.addView(button("${s.title}\n${s.topic}") { showSource(s) }) }
            if(items.size>100) results.addView(muted("Showing the first 100 cards. Search to narrow the list.",13f))
        }
        val row=LinearLayout(this)
        row.addView(button("Search offline") {
            val q=input.text.toString().trim(); if(q.isNotEmpty()) {
                val found=store.search(q,30);show(found)
                if(found.isEmpty()) results.addView(muted("No matching local card or glossary entry. You can ask for a tentative model suggestion."))
                results.addView(button(if(found.isEmpty()) "Suggest a possible meaning" else "Explain with these sources") { explain(q,false,null) },0)
            }
        },LinearLayout.LayoutParams(0,-2,1f))
        row.addView(button("Explain passage") { if(input.text.isNotBlank()) explain(input.text.toString(),false,null) },LinearLayout.LayoutParams(0,-2,1f))
        content.addView(row); content.addView(results);show(store.browse())
    }
    private fun showSource(source:Source) {
        val scroll=ScrollView(this)
        val box=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(dp(18),dp(6),dp(18),dp(12)) }
        box.addView(muted(source.attribution,12f))
        val body=label(source.body);body.setTextIsSelectable(true)
        body.customSelectionActionModeCallback=object: ActionMode.Callback {
            override fun onCreateActionMode(mode:ActionMode,menu:Menu):Boolean { menu.add(0,101,0,"Explain");menu.add(0,102,1,"Summarise"); return true }
            override fun onPrepareActionMode(mode:ActionMode,menu:Menu)=false
            override fun onDestroyActionMode(mode:ActionMode) {}
            override fun onActionItemClicked(mode:ActionMode,item:MenuItem):Boolean {
                if(item.itemId!=101 && item.itemId!=102) return false
                val a=body.selectionStart.coerceAtLeast(0);val b=body.selectionEnd.coerceAtLeast(a)
                val chosen=body.text.substring(a,b);mode.finish()
                if(chosen.isNotBlank() && !busy) { sourceDialog?.dismiss(); explain(chosen,item.itemId==102,source) };return true
            }
        }
        box.addView(body);box.addView(button("Explain this card") { if(!busy) { sourceDialog?.dismiss();explain(source.title,false,source) } })
        scroll.addView(box)
        sourceDialog=AlertDialog.Builder(this).setTitle(source.title).setView(scroll).setPositiveButton("Close",null).show()
    }
    private var sourceDialog: AlertDialog?=null
    private fun explain(text:String,summarise:Boolean,origin:Source?) {
        if(busy)return
        selection=text.take(1800);summary=summarise;history.clear()
        sources=(listOfNotNull(origin)+store.search(selection,4)).distinctBy { it.id }.take(4)
        content.removeAllViews();content.addView(label(if(summary) "Summarise" else "Explain",22f).apply { typeface=Typeface.DEFAULT_BOLD })
        content.addView(label(selection,17f).apply { background=shape(Color.argb(24,255,255,255),18);setPadding(dp(14),dp(12),dp(14),dp(12)) })
        content.addView(muted(if(sources.isEmpty()) "No local match • Model suggestions are unverified" else "Retrieved context · tap to read the original",13f))
        sources.forEachIndexed { i,s -> content.addView(button("[${i+1}] ${s.title} · ${s.topic}") { showSource(s) }) }
        content.addView(muted("AI output is separate from your validated revision content. Check the source cards for clinical decisions.",12f))
        if(sources.isEmpty()) content.addView(button("Offer a possible meaning") { generate("") }) else generate("")
    }
    private fun generate(question:String) {
        if(busy)return
        if(!modelFile.exists()) { updateStatus("Import the recommended model in Model & info to enable AI.");return }
        busy=true;cancelled=false
        val answer=label(if(question.isBlank()) "Loading model / reading context…" else "You: $question\n\nReading context…").apply { background=shape(Color.argb(215,12,23,39),20);setPadding(dp(15),dp(14),dp(15),dp(14)) }
        content.addView(answer)
        val stop=button("Stop") { cancelled=true;Native.cancel();updateStatus("Stopping…") };content.addView(stop)
        val prompt=ReaderLogic.prompt(selection,sources.map { it.context() },history,question,summary)
        worker.execute {
            try {
                if(!loaded) { Native.load(modelFile.path);loaded=true }
                val result=if(cancelled) "" else ReaderLogic.visibleAnswer(Native.generate(prompt).toString(Charsets.UTF_8))
                runOnUiThread {
                    if(isDestroyed)return@runOnUiThread
                    busy=false;content.removeView(stop)
                    answer.text=(if(question.isNotBlank()) "You: $question\n\n" else "")+(if(cancelled) "Stopped." else if(result.isBlank()) "No usable answer. Try a shorter selection or check the model." else (if(sources.isEmpty()) "Possible meaning · unverified\n\n" else "AI explanation · verify against sources\n\n")+result)
                    answer.setTextIsSelectable(true)
                    if(result.isNotBlank() && !cancelled) {
                        history.add((question.ifBlank { "Explain: $selection" }) to result)
                        content.addView(audioControls(result))
                    }
                    updateStatus();followup()
                }
            } catch(e:Exception) { runOnUiThread { if(!isDestroyed) { busy=false;content.removeView(stop);answer.text="${e.message ?: "Unable to run model"}\nTry a shorter selection or reimport the recommended model.";updateStatus();followup() } } }
        }
    }
    private fun followup() {
        val row=LinearLayout(this)
        val input=inputField("Ask about this material…",4)
        row.addView(input,LinearLayout.LayoutParams(0,-2,1f))
        row.addView(button("Ask") { if(!busy && input.text.isNotBlank()) { val q=input.text.toString(); content.removeView(row); generate(q) } })
        content.addView(row)
    }
    private fun settings() {
        val box=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(8),dp(20),dp(8)) }
        box.addView(label("One-time setup: download Qwen3 4B Q4_K_M (~2.5 GB), then import the .gguf file. Allow roughly 5 GB free during import. Downloads open in your browser. This app has no internet permission.",15f))
        box.addView(muted("Read answer uses an installed Android text-to-speech voice that is marked as not requiring a network connection. If no offline voice is installed, speech stays unavailable.",13f))
        box.addView(button("Download recommended GGUF") { startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(MODEL_URL))) })
        box.addView(button("Import GGUF from device") {
            if(busy) { Toast.makeText(this,"Stop the current task first",Toast.LENGTH_SHORT).show() } else {
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="*/*";addCategory(Intent.CATEGORY_OPENABLE) },42)
            }
        })
        box.addView(label("Preview 0.1.3 · ARM64 / Android 9+ · CPU inference · local TTS\n983 UKMLA cards. Glossary: selected public-domain text from the National Cancer Institute Dictionary of Cancer Terms (US wording; not a comprehensive UK dictionary). Each definition includes its source URL.\n\nSource policy: cancer.gov/policies/copyright-reuse\nModel: Qwen3 (Apache 2.0), imported separately. Runtime: llama.cpp (MIT), CPU inference in the stable preview. Speech: Android system TextToSpeech.\n\nLuna and question validation are unchanged in the existing UKMLA app. Follow-ups stay in this reading session and are not saved or sent anywhere.\n\nThis preview needs on-device performance and clinical accuracy testing before routine reliance.",13f))
        val scroll=ScrollView(this);scroll.addView(box)
        AlertDialog.Builder(this).setTitle("Offline model & attribution").setView(scroll).setPositiveButton("Close",null).show()
    }
    @Deprecated("Activity result API for dependency-free native preview")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        val uri=data?.data ?: return
        if(requestCode!=42 || resultCode!=RESULT_OK || busy)return
        busy=true;updateStatus("Importing model — keep the app open…")
        worker.execute {
            val temp=File(filesDir,"model-import.tmp")
            try {
                contentResolver.openInputStream(uri)!!.use { input ->
                    val magic=ByteArray(4);var n=0;while(n<4) { val r=input.read(magic,n,4-n);require(r>0) { "Empty model file" };n+=r }
                    require(magic.contentEquals(byteArrayOf(71,71,85,70))) { "This is not a GGUF model" }
                    temp.outputStream().use { output -> output.write(magic); val buffer=ByteArray(1024*1024);var total=4L
                        while(true) { val count=input.read(buffer);if(count<0)break;total+=count;require(total<5L*1024*1024*1024) { "Model exceeds 5 GB; use Q4_K_M" };require(filesDir.usableSpace>count+64L*1024*1024) { "Insufficient storage" };output.write(buffer,0,count) }
                    }
                }
                require(temp.renameTo(modelFile)) { "Could not finish import" };loaded=false
                runOnUiThread { if(!isDestroyed) { busy=false;updateStatus("Model imported. Return to a card and choose Explain.") } }
            } catch(e:Exception) { temp.delete();runOnUiThread { if(!isDestroyed) { busy=false;updateStatus("Import failed: ${e.message}") } } }
        }
    }
}
