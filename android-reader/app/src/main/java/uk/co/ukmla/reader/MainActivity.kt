package uk.co.ukmla.reader

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.speech.tts.TextToSpeech
import android.os.Build
import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.*
import java.io.File
import java.util.concurrent.Executors
import java.util.Locale

class MainActivity : Activity() {
    companion object {
        private val worker=Executors.newSingleThreadExecutor()
        private const val MODEL_URL="https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf?download=true"
    }
    private lateinit var store: CardStore
    private var tts: TextToSpeech?=null
    private var ttsReady=false
    // Mirrors the default UKMLA web palette (v2/app.css), rather than the old gold reader skin.
    private val navy0=Color.rgb(2,8,20)
    private val navy1=Color.rgb(4,21,44)
    private val navy2=Color.rgb(8,40,75)
    private val navy3=Color.rgb(10,60,111)
    private val bgTop=navy0
    private val bgBottom=Color.rgb(3,16,31)
    private val panel=Color.rgb(7,30,57)
    private val panelStrong=Color.rgb(9,40,71)
    private val textPrimary=Color.rgb(247,251,255)
    private val textMuted=Color.rgb(169,189,210)
    private val accent=Color.rgb(46,183,255)
    private val cyan=Color.rgb(139,234,255)
    private val border=Color.argb(56,117,196,255)
    private var backendLabel="CPU inference"
    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private lateinit var content: LinearLayout
    private var busy=false
    private var selection=""
    private var sources=listOf<Source>()
    private var summary=false
    private val history=mutableListOf<Pair<String,String>>()
    @Volatile private var cancelled=false
    private var pendingAnswer: TextView?=null
    private var pendingStop: View?=null
    private var pendingQuestion=""
    private var pendingSourceBacked=false

    private val inferenceReceiver=object: BroadcastReceiver() {
        override fun onReceive(context:Context,intent:Intent) {
            if(intent.action!=BackgroundInferenceService.ACTION_STATE)return
            handleInferenceState(
                intent.getStringExtra(BackgroundInferenceService.EXTRA_STATE).orEmpty(),
                intent.getStringExtra(BackgroundInferenceService.EXTRA_RESULT).orEmpty(),
                intent.getStringExtra(BackgroundInferenceService.EXTRA_ERROR).orEmpty(),
                intent.getStringExtra(BackgroundInferenceService.EXTRA_QUESTION).orEmpty(),
                intent.getBooleanExtra(BackgroundInferenceService.EXTRA_SOURCE_BACKED,false)
            )
        }
    }
    private val modelFile get()=File(filesDir,"reader-model.gguf")
    private fun dp(x:Int)=(x*resources.displayMetrics.density).toInt()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor=bgTop
        window.navigationBarColor=bgTop
        initTts()
        store=CardStore(this)
        busy=BackgroundInferenceService.isRunning(this)
        val inferenceFilter=IntentFilter(BackgroundInferenceService.ACTION_STATE)
        if(Build.VERSION.SDK_INT>=33) registerReceiver(inferenceReceiver,inferenceFilter,Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("DEPRECATION") registerReceiver(inferenceReceiver,inferenceFilter)
        root=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(dp(14),dp(8),dp(14),dp(7))
            background=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(navy0,navy1,bgBottom))
        }
        root.setOnApplyWindowInsetsListener { v, insets -> v.setPadding(dp(18),insets.systemWindowInsetTop+dp(8),dp(18),insets.systemWindowInsetBottom+dp(8)); insets }
        setContentView(root)
        val topBar=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL
            gravity=android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(2),dp(3),dp(2),dp(8))
        }
        val brandMark=label("UK",15f).apply {
            typeface=Typeface.DEFAULT_BOLD
            gravity=android.view.Gravity.CENTER
            background=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(navy3,accent)).apply { cornerRadius=dp(14).toFloat() }
            setPadding(0,0,0,0)
        }
        topBar.addView(brandMark,LinearLayout.LayoutParams(dp(44),dp(44)))
        val brandText=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(12),0,0,0) }
        brandText.addView(label("UKMLA",19f).apply { typeface=Typeface.create(Typeface.SERIF,Typeface.BOLD);setPadding(0,0,0,0) })
        brandText.addView(muted("Card atlas · offline reader",11f).apply { setPadding(0,0,0,0) })
        topBar.addView(brandText,LinearLayout.LayoutParams(0,-2,1f))
        topBar.addView(button("⌕") { if(!busy) home() },LinearLayout.LayoutParams(dp(46),dp(44)))
        root.addView(topBar)

        status=label("",12f).apply {
            setTextColor(textMuted)
            background=shape(Color.argb(105,9,40,71),14)
            setPadding(dp(12),dp(7),dp(12),dp(7))
        }
        root.addView(status); updateStatus()

        val scroller=ScrollView(this)
        content=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(0,dp(8),0,dp(8)) }
        scroller.addView(content);root.addView(scroller,LinearLayout.LayoutParams(-1,0,1f))

        val nav=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL
            background=shape(Color.argb(242,2,13,28),16)
            setPadding(dp(4),dp(4),dp(4),dp(4))
        }
        nav.addView(button("▦  Cards") { if(!busy) home() },LinearLayout.LayoutParams(0,-2,1f))
        nav.addView(button("◉  Model") { settings() },LinearLayout.LayoutParams(0,-2,1f))
        root.addView(nav)
        val external=intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
        if(!external.isNullOrBlank()) explain(external,false,null) else home()
        handleLaunchIntent(intent)
    }
    override fun onNewIntent(intent:Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLaunchIntent(intent)
    }
    override fun onDestroy() {
        runCatching { unregisterReceiver(inferenceReceiver) }
        cancelled=true
        tts?.stop()
        tts?.shutdown()
        store.close()
        super.onDestroy()
    }
    private fun shape(fill:Int,radius:Int,stroke:Int?=border)=GradientDrawable().apply {
        setColor(fill);cornerRadius=dp(radius).toFloat();stroke?.let { setStroke(dp(1),it) }
    }
    private fun label(text:String,size:Float=16f)=TextView(this).apply {
        this.text=text;textSize=size;setTextColor(textPrimary);typeface=Typeface.SERIF;setPadding(0,dp(8),0,dp(8))
    }
    private fun muted(text:String,size:Float=14f)=label(text,size).apply { setTextColor(textMuted) }
    private fun button(text:String,action:()->Unit)=Button(this).apply {
        this.text=text;isAllCaps=false;textSize=13f;setTextColor(textPrimary);typeface=Typeface.DEFAULT_BOLD
        background=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(Color.argb(205,10,60,111),Color.argb(220,4,31,61))).apply {
            cornerRadius=dp(13).toFloat();setStroke(dp(1),border)
        }
        setPadding(dp(12),dp(9),dp(12),dp(9));minHeight=dp(46)
        setOnClickListener { action() }
    }
    private fun inputField(hintText:String,max:Int)=EditText(this).apply {
        hint=hintText;maxLines=max;setTextColor(textPrimary);setHintTextColor(textMuted);typeface=Typeface.SERIF
        background=shape(Color.argb(158,0,12,28),13);setPadding(dp(14),dp(12),dp(14),dp(12))
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
    private fun updateStatus(message:String?=null) {
        status.text=message ?: when {
            BackgroundInferenceService.isRunning(this) -> "CPU inference • running in background • you can switch apps"
            modelFile.exists() -> "Local-first • $backendLabel • Answers may be inaccurate"
            else -> "Local-first • Cards & glossary ready • Import a model for AI"
        }
    }
    private fun home() {
        content.removeAllViews(); history.clear()
        val hero=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            background=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(Color.rgb(8,38,72),Color.rgb(4,23,47))).apply {
                cornerRadius=dp(24).toFloat();setStroke(dp(1),border)
            }
            setPadding(dp(20),dp(18),dp(20),dp(18))
        }
        hero.addView(label("LOCAL-FIRST · CARD ATLAS",11f).apply { setTextColor(cyan);typeface=Typeface.DEFAULT_BOLD;letterSpacing=.13f;setPadding(0,0,0,dp(5)) })
        hero.addView(label("Offline reader",34f).apply { typeface=Typeface.create(Typeface.SERIF,Typeface.BOLD);setPadding(0,0,0,dp(7)) })
        hero.addView(muted("Search the same UKMLA card atlas, open source material, then ask the local Qwen model to explain it.",15f))
        val stats=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL;setPadding(0,dp(10),0,0) }
        fun stat(big:String,small:String)=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            background=shape(Color.argb(92,0,13,29),14)
            setPadding(dp(10),dp(9),dp(10),dp(9))
            addView(label(big,18f).apply { setTextColor(cyan);typeface=Typeface.DEFAULT_BOLD;setPadding(0,0,0,0) })
            addView(muted(small,10f).apply { setPadding(0,0,0,0) })
        }
        stats.addView(stat("983","cards"),LinearLayout.LayoutParams(0,-2,1f).apply { marginEnd=dp(5) })
        stats.addView(stat("1,258","glossary"),LinearLayout.LayoutParams(0,-2,1f).apply { marginStart=dp(5);marginEnd=dp(5) })
        stats.addView(stat("OFFLINE","model"),LinearLayout.LayoutParams(0,-2,1f).apply { marginStart=dp(5) })
        hero.addView(stats)
        content.addView(hero)

        content.addView(label("Cards & search",22f).apply { typeface=Typeface.create(Typeface.SERIF,Typeface.BOLD);setPadding(0,dp(18),0,dp(3)) })
        content.addView(muted("Search 1–3 words for definitions. Select a passage on any card to Explain or Summarise.",13f))
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
        },LinearLayout.LayoutParams(0,-2,1f).apply { marginEnd=dp(5) })
        row.addView(button("Explain passage") { if(input.text.isNotBlank()) explain(input.text.toString(),false,null) },LinearLayout.LayoutParams(0,-2,1f).apply { marginStart=dp(5) })
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
        if(busy || BackgroundInferenceService.isRunning(this))return
        if(!modelFile.exists()) { updateStatus("Import the recommended model in Model & info to enable AI.");return }
        busy=true;cancelled=false
        pendingQuestion=question
        pendingSourceBacked=sources.isNotEmpty()

        val answer=label(if(question.isBlank()) "Starting local model…" else "You: $question\n\nStarting local model…").apply {
            background=shape(Color.argb(230,5,29,57),20)
            setPadding(dp(15),dp(14),dp(15),dp(14))
        }
        content.addView(answer)
        pendingAnswer=answer
        val stop=button("Stop") {
            cancelled=true
            cancelBackgroundInference()
            updateStatus("Stopping…")
        }
        content.addView(stop)
        pendingStop=stop

        val prompt=ReaderLogic.prompt(selection,sources.map { it.context() },history,question,summary)
        requestNotificationPermissionIfNeeded()

        val serviceIntent=Intent(this,BackgroundInferenceService::class.java).apply {
            action=BackgroundInferenceService.ACTION_START
            putExtra(BackgroundInferenceService.EXTRA_PROMPT,prompt)
            putExtra(BackgroundInferenceService.EXTRA_MODEL_PATH,modelFile.path)
            putExtra(BackgroundInferenceService.EXTRA_QUESTION,question)
            putExtra(BackgroundInferenceService.EXTRA_DISPLAY,question.ifBlank { selection.take(140) })
            putExtra(BackgroundInferenceService.EXTRA_SOURCE_BACKED,pendingSourceBacked)
        }
        try {
            if(Build.VERSION.SDK_INT>=26) startForegroundService(serviceIntent) else startService(serviceIntent)
            updateStatus("CPU inference • running in background • you can switch apps")
            answer.text=(if(question.isNotBlank()) "You: $question\n\n" else "")+
                "Generating locally on CPU. You can switch to another app; UKMLA will notify you when the answer is ready."
        } catch(e:Exception) {
            busy=false
            removePendingStop()
            answer.text="${e.message ?: "Unable to start background generation"}"
            updateStatus()
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),73)
        }
    }

    private fun cancelBackgroundInference() {
        runCatching {
            startService(Intent(this,BackgroundInferenceService::class.java).setAction(BackgroundInferenceService.ACTION_CANCEL))
        }
    }

    private fun handleInferenceState(state:String,result:String,error:String,question:String,sourceBacked:Boolean) {
        when(state) {
            BackgroundInferenceService.STATE_RUNNING -> {
                busy=true
                updateStatus("CPU inference • running in background • you can switch apps")
            }
            BackgroundInferenceService.STATE_DONE -> {
                busy=false
                backendLabel="CPU inference"
                val q=question.ifBlank { pendingQuestion }
                val backed=sourceBacked || pendingSourceBacked
                val answer=pendingAnswer
                if(answer!=null) {
                    answer.text=(if(q.isNotBlank()) "You: $q\n\n" else "")+
                        (if(backed) "AI explanation · verify against sources\n\n" else "Possible meaning · unverified\n\n")+result
                    answer.setTextIsSelectable(true)
                    removePendingStop()
                    if(result.isNotBlank()) {
                        history.add((q.ifBlank { "Explain: $selection" }) to result)
                        content.addView(audioControls(result))
                        followup()
                    }
                }
                clearPending()
                updateStatus("Answer ready • CPU inference")
            }
            BackgroundInferenceService.STATE_ERROR -> {
                busy=false
                pendingAnswer?.text=(if(error.isBlank()) "Unable to run model." else error)+"\nTry a shorter selection or reimport the recommended model."
                removePendingStop()
                clearPending()
                updateStatus("Generation failed")
            }
            BackgroundInferenceService.STATE_CANCELLED -> {
                busy=false
                pendingAnswer?.text="Stopped."
                removePendingStop()
                clearPending()
                updateStatus()
            }
        }
    }

    private fun removePendingStop() {
        val view=pendingStop
        (view?.parent as? ViewGroup)?.removeView(view)
        pendingStop=null
    }

    private fun clearPending() {
        pendingAnswer=null
        pendingStop=null
        pendingQuestion=""
        pendingSourceBacked=false
    }

    private fun handleLaunchIntent(i:Intent?) {
        if(i?.getBooleanExtra(BackgroundInferenceService.EXTRA_SHOW_INFERENCE,false)!=true)return
        val prefs=getSharedPreferences(BackgroundInferenceService.PREFS,MODE_PRIVATE)
        when(prefs.getString(BackgroundInferenceService.KEY_STATE,BackgroundInferenceService.STATE_IDLE)) {
            BackgroundInferenceService.STATE_RUNNING -> showBackgroundProgress()
            BackgroundInferenceService.STATE_DONE -> showStoredResult()
            BackgroundInferenceService.STATE_ERROR -> showStoredError()
        }
    }

    private fun showBackgroundProgress() {
        if(pendingAnswer!=null)return
        busy=true
        val prefs=getSharedPreferences(BackgroundInferenceService.PREFS,MODE_PRIVATE)
        content.removeAllViews()
        content.addView(label("Generating in background",24f).apply { typeface=Typeface.create(Typeface.SERIF,Typeface.BOLD) })
        content.addView(muted(prefs.getString(BackgroundInferenceService.KEY_DISPLAY,"Local Qwen inference") ?: "Local Qwen inference",14f))
        val answer=label("The 4B model is still running on the CPU. You can leave UKMLA again; generation will continue.",16f).apply {
            background=shape(Color.argb(230,5,29,57),20);setPadding(dp(15),dp(14),dp(15),dp(14))
        }
        content.addView(answer);pendingAnswer=answer
        val stop=button("Stop generation") { cancelled=true;cancelBackgroundInference();updateStatus("Stopping…") }
        content.addView(stop);pendingStop=stop
        updateStatus("CPU inference • running in background • you can switch apps")
    }

    private fun showStoredResult() {
        if(pendingAnswer!=null)return
        val prefs=getSharedPreferences(BackgroundInferenceService.PREFS,MODE_PRIVATE)
        val result=prefs.getString(BackgroundInferenceService.KEY_RESULT,"").orEmpty()
        if(result.isBlank())return
        val question=prefs.getString(BackgroundInferenceService.KEY_QUESTION,"").orEmpty()
        val sourceBacked=prefs.getBoolean(BackgroundInferenceService.KEY_SOURCE_BACKED,false)
        content.removeAllViews()
        content.addView(label("Completed local answer",24f).apply { typeface=Typeface.create(Typeface.SERIF,Typeface.BOLD) })
        val answer=label(
            (if(question.isNotBlank()) "You: $question\n\n" else "")+
            (if(sourceBacked) "AI explanation · verify against sources\n\n" else "Possible meaning · unverified\n\n")+result
        ).apply {
            background=shape(Color.argb(230,5,29,57),20);setPadding(dp(15),dp(14),dp(15),dp(14));setTextIsSelectable(true)
        }
        content.addView(answer)
        content.addView(audioControls(result))
        content.addView(button("Back to cards") { home() })
        busy=false
        updateStatus("Answer ready • CPU inference")
    }

    private fun showStoredError() {
        val prefs=getSharedPreferences(BackgroundInferenceService.PREFS,MODE_PRIVATE)
        val error=prefs.getString(BackgroundInferenceService.KEY_ERROR,"Unable to run model.").orEmpty()
        content.removeAllViews()
        content.addView(label("Generation failed",24f).apply { typeface=Typeface.create(Typeface.SERIF,Typeface.BOLD) })
        content.addView(label(error,16f).apply { background=shape(Color.argb(230,5,29,57),20);setPadding(dp(15),dp(14),dp(15),dp(14)) })
        content.addView(button("Back to cards") { home() })
        busy=false
        updateStatus("Generation failed")
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
            if(busy || BackgroundInferenceService.isRunning(this)) { Toast.makeText(this,"Stop the current generation first",Toast.LENGTH_SHORT).show() } else {
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="*/*";addCategory(Intent.CATEGORY_OPENABLE) },42)
            }
        })
        box.addView(label("Preview 0.1.6 · ARM64 / Android 9+ · background CPU inference · local TTS\n983 UKMLA cards. Glossary: selected public-domain text from the National Cancer Institute Dictionary of Cancer Terms (US wording; not a comprehensive UK dictionary). Each definition includes its source URL.\n\nSource policy: cancer.gov/policies/copyright-reuse\nModel: Qwen3 (Apache 2.0), imported separately. Runtime: llama.cpp (MIT), CPU inference only. User-started generation continues through an Android foreground service when you switch apps. Speech: Android system TextToSpeech.\n\nLuna and question validation are unchanged in the existing UKMLA app. Follow-ups stay in this reading session and are not saved or sent anywhere.\n\nThis preview needs on-device performance and clinical accuracy testing before routine reliance.",13f))
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
                require(temp.renameTo(modelFile)) { "Could not finish import" }
                BackgroundInferenceService.invalidateModel()
                runOnUiThread { if(!isDestroyed) { busy=false;updateStatus("Model imported. Return to a card and choose Explain.") } }
            } catch(e:Exception) { temp.delete();runOnUiThread { if(!isDestroyed) { busy=false;updateStatus("Import failed: ${e.message}") } } }
        }
    }
}
