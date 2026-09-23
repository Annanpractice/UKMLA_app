package uk.co.qwen.assistant

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StyleSpan
import android.view.Gravity
import android.view.View
import android.widget.*
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : Activity() {
    companion object {
        private const val MODEL_URL="https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf?download=true"
        private const val IMPORT_REQUEST=42
        private val fileWorker=Executors.newSingleThreadExecutor()
    }

    private val bg=Color.rgb(4,10,20)
    private val panel=Color.rgb(10,25,44)
    private val panel2=Color.rgb(13,34,58)
    private val textColor=Color.rgb(244,248,253)
    private val muted=Color.rgb(163,183,204)
    private val cyan=Color.rgb(112,220,255)
    private val border=Color.argb(70,110,190,245)

    private lateinit var root:LinearLayout
    private lateinit var status:TextView
    private lateinit var chatScroll:ScrollView
    private lateinit var chat:LinearLayout
    private lateinit var input:EditText
    private lateinit var send:Button
    private lateinit var stop:Button
    private lateinit var thinkSwitch:Switch
    private lateinit var medicalSwitch:Switch
    private lateinit var history:MutableList<ChatTurn>

    private var busy=false
    private var lastAnswer=""
    private var tts:TextToSpeech?=null
    private var ttsReady=false

    private val modelFile get()=File(filesDir,"qwen3-4b-q4km.gguf")
    private fun dp(v:Int)=(v*resources.displayMetrics.density).toInt()

    private val inferenceReceiver=object:BroadcastReceiver() {
        override fun onReceive(context:Context,intent:Intent) {
            if(intent.action!=BackgroundInferenceService.ACTION_STATE)return
            handleInference(
                intent.getStringExtra(BackgroundInferenceService.EXTRA_STATE).orEmpty(),
                intent.getStringExtra(BackgroundInferenceService.EXTRA_USER).orEmpty(),
                intent.getStringExtra(BackgroundInferenceService.EXTRA_RESULT).orEmpty(),
                intent.getStringExtra(BackgroundInferenceService.EXTRA_ERROR).orEmpty(),
                intent.getBooleanExtra(BackgroundInferenceService.EXTRA_THINKING,false)
            )
        }
    }

    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor=bg
        window.navigationBarColor=bg
        history=ChatStore.load(this)
        initTts()
        registerInferenceReceiver()
        buildUi()
        renderHistory()

        val external=intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
        if(!external.isNullOrBlank()) input.setText(external)

        restoreInferenceState()
    }

    override fun onResume() {
        super.onResume()
        restoreInferenceState()
    }

    override fun onNewIntent(intent:Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        restoreInferenceState()
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(inferenceReceiver) }
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }

    private fun registerInferenceReceiver() {
        val filter=IntentFilter(BackgroundInferenceService.ACTION_STATE)
        if(Build.VERSION.SDK_INT>=33) registerReceiver(inferenceReceiver,filter,Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("DEPRECATION") registerReceiver(inferenceReceiver,filter)
    }

    private fun buildUi() {
        root=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(dp(14),dp(8),dp(14),dp(8))
            background=GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(bg,Color.rgb(5,20,37),bg)
            )
        }
        root.setOnApplyWindowInsetsListener { v,insets ->
            v.setPadding(dp(14),insets.systemWindowInsetTop+dp(8),dp(14),insets.systemWindowInsetBottom+dp(8))
            insets
        }
        setContentView(root)

        val header=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL
            gravity=Gravity.CENTER_VERTICAL
        }
        val titles=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL }
        titles.addView(label("Local Qwen",24f).apply { typeface=Typeface.DEFAULT_BOLD;setPadding(0,0,0,0) })
        titles.addView(label("Qwen3 4B · completely on-device",11f,muted).apply { setPadding(0,0,0,0) })
        header.addView(titles,LinearLayout.LayoutParams(0,-2,1f))
        header.addView(smallButton("New") { newChat() })
        header.addView(smallButton("Model") { modelDialog() })
        root.addView(header)

        status=label("",12f,muted).apply {
            background=shape(panel,13)
            setPadding(dp(11),dp(7),dp(11),dp(7))
        }
        root.addView(status)

        val modes=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL
            gravity=Gravity.CENTER_VERTICAL
            setPadding(0,dp(6),0,dp(6))
        }
        thinkSwitch=Switch(this).apply {
            text="Think"
            setTextColor(textColor)
            textSize=13f
        }
        medicalSwitch=Switch(this).apply {
            text="Medical"
            setTextColor(textColor)
            textSize=13f
        }
        modes.addView(thinkSwitch,LinearLayout.LayoutParams(0,-2,1f))
        modes.addView(medicalSwitch,LinearLayout.LayoutParams(0,-2,1f))
        root.addView(modes)

        chatScroll=ScrollView(this).apply { isFillViewport=true }
        chat=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(0,dp(5),0,dp(8))
        }
        chatScroll.addView(chat)
        root.addView(chatScroll,LinearLayout.LayoutParams(-1,0,1f))

        input=EditText(this).apply {
            hint="Message Qwen…"
            setHintTextColor(muted)
            setTextColor(textColor)
            textSize=16f
            minLines=2
            maxLines=6
            background=shape(Color.rgb(7,18,32),16)
            setPadding(dp(13),dp(10),dp(13),dp(10))
        }
        root.addView(input)

        val actions=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL
            setPadding(0,dp(6),0,0)
        }
        send=button("Send") { sendMessage() }
        stop=button("Stop") { cancelGeneration() }.apply { visibility=View.GONE }
        actions.addView(send,LinearLayout.LayoutParams(0,-2,1f).apply { marginEnd=dp(5) })
        actions.addView(stop,LinearLayout.LayoutParams(0,-2,1f).apply { marginStart=dp(5) })
        root.addView(actions)
        updateStatus()
    }

    private fun label(value:String,size:Float=15f,color:Int=textColor)=TextView(this).apply {
        text=value
        textSize=size
        setTextColor(color)
        setPadding(0,dp(6),0,dp(6))
    }

    private fun shape(fill:Int,radius:Int)=GradientDrawable().apply {
        setColor(fill)
        cornerRadius=dp(radius).toFloat()
        setStroke(dp(1),border)
    }

    private fun button(value:String,action:()->Unit)=Button(this).apply {
        text=value
        isAllCaps=false
        setTextColor(textColor)
        textSize=14f
        typeface=Typeface.DEFAULT_BOLD
        background=shape(Color.rgb(10,54,91),14)
        minHeight=dp(48)
        setOnClickListener { action() }
    }

    private fun smallButton(value:String,action:()->Unit)=Button(this).apply {
        text=value
        isAllCaps=false
        setTextColor(textColor)
        textSize=12f
        background=shape(panel2,12)
        minHeight=dp(42)
        setPadding(dp(10),0,dp(10),0)
        setOnClickListener { action() }
    }

    private fun renderHistory() {
        chat.removeAllViews()
        if(history.isEmpty()) {
            val intro=LinearLayout(this).apply {
                orientation=LinearLayout.VERTICAL
                background=shape(panel,18)
                setPadding(dp(16),dp(14),dp(16),dp(14))
            }
            intro.addView(label("A deliberately small local assistant",18f).apply { typeface=Typeface.DEFAULT_BOLD })
            intro.addView(label("Fast mode uses Qwen's /no_think switch. Think mode lets Qwen reason first and can take several minutes. Medical mode adds one short clinical instruction; General mode adds no system prompt.",14f,muted))
            chat.addView(intro)
        }
        history.forEach { turn ->
            addUserBubble(turn.user)
            addAssistantBubble(turn.assistant,true)
        }
        scrollBottom()
    }

    private fun addUserBubble(value:String) {
        val wrap=LinearLayout(this).apply {
            gravity=Gravity.END
            setPadding(dp(42),dp(5),0,dp(5))
        }
        val bubble=label(value,15f).apply {
            background=shape(Color.rgb(10,59,101),17)
            setPadding(dp(13),dp(10),dp(13),dp(10))
        }
        wrap.addView(bubble)
        chat.addView(wrap)
    }

    private fun markdownBold(value:String):CharSequence {
        val plain=StringBuilder()
        val ranges=mutableListOf<Pair<Int,Int>>()
        var i=0
        while(i<value.length) {
            if(i+1<value.length && value[i]=='*' && value[i+1]=='*') {
                val close=value.indexOf("**",i+2)
                if(close>=i+2) {
                    val start=plain.length
                    plain.append(value.substring(i+2,close))
                    if(plain.length>start) ranges.add(start to plain.length)
                    i=close+2
                    continue
                }
            }
            plain.append(value[i])
            i++
        }
        return SpannableString(plain.toString()).apply {
            ranges.forEach { (start,end) ->
                setSpan(StyleSpan(Typeface.BOLD),start,end,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
    }

    private fun addAssistantBubble(value:String,readable:Boolean) {
        val wrap=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(0,dp(5),dp(28),dp(5))
        }
        val bubble=label("",15f).apply {
            text=markdownBold(value)
            background=shape(panel,17)
            setPadding(dp(13),dp(10),dp(13),dp(10))
            setTextIsSelectable(true)
        }
        wrap.addView(bubble)
        if(readable && value.isNotBlank()) {
            wrap.addView(smallButton("▶ Read aloud") { speak(value) })
        }
        chat.addView(wrap)
    }

    private fun showPending(user:String,thinking:Boolean) {
        addUserBubble(user)
        addAssistantBubble(
            if(thinking) "Thinking locally on CPU… You can switch apps." else "Generating locally on CPU… You can switch apps.",
            false
        )
        scrollBottom()
    }

    private fun sendMessage() {
        if(busy || BackgroundInferenceService.isRunning(this))return
        val user=input.text.toString().trim()
        if(user.isBlank())return
        if(!modelFile.exists()) {
            Toast.makeText(this,"Import the Qwen3 4B GGUF first.",Toast.LENGTH_LONG).show()
            modelDialog()
            return
        }

        val thinking=thinkSwitch.isChecked
        val medical=medicalSwitch.isChecked
        val prompt=PromptBuilder.build(history,user,thinking,medical)
        input.setText("")
        busy=true
        setBusyUi()
        showPending(user,thinking)
        requestNotificationPermission()

        val service=Intent(this,BackgroundInferenceService::class.java).apply {
            action=BackgroundInferenceService.ACTION_START
            putExtra(BackgroundInferenceService.EXTRA_PROMPT,prompt)
            putExtra(BackgroundInferenceService.EXTRA_MODEL_PATH,modelFile.path)
            putExtra(BackgroundInferenceService.EXTRA_USER,user)
            putExtra(BackgroundInferenceService.EXTRA_THINKING,thinking)
            putExtra(BackgroundInferenceService.EXTRA_MEDICAL,medical)
            putExtra(BackgroundInferenceService.EXTRA_MAX_TOKENS,if(thinking)384 else 160)
        }
        try {
            if(Build.VERSION.SDK_INT>=26) startForegroundService(service) else startService(service)
            updateStatus(if(thinking) "Thinking in background • CPU" else "Generating in background • CPU")
        } catch(e:Exception) {
            busy=false
            setBusyUi()
            renderHistory()
            Toast.makeText(this,e.message ?: "Could not start local inference.",Toast.LENGTH_LONG).show()
        }
    }

    private fun cancelGeneration() {
        runCatching {
            startService(Intent(this,BackgroundInferenceService::class.java).setAction(BackgroundInferenceService.ACTION_CANCEL))
        }
        updateStatus("Stopping…")
    }

    private fun handleInference(state:String,user:String,result:String,error:String,thinking:Boolean) {
        when(state) {
            BackgroundInferenceService.STATE_RUNNING -> {
                busy=true
                setBusyUi()
                updateStatus(if(thinking) "Thinking in background • CPU" else "Generating in background • CPU")
            }
            BackgroundInferenceService.STATE_DONE -> {
                busy=false
                completeTurn(user,result)
                BackgroundInferenceService.markConsumed(this)
                setBusyUi()
                updateStatus("Answer ready • CPU")
            }
            BackgroundInferenceService.STATE_ERROR -> {
                busy=false
                BackgroundInferenceService.markConsumed(this)
                setBusyUi()
                renderHistory()
                addAssistantBubble(error.ifBlank { "Local generation failed." },false)
                updateStatus("Generation stopped")
            }
            BackgroundInferenceService.STATE_CANCELLED -> {
                busy=false
                BackgroundInferenceService.markConsumed(this)
                setBusyUi()
                renderHistory()
                updateStatus()
            }
        }
    }

    private fun completeTurn(user:String,result:String) {
        if(result.isBlank())return
        val last=history.lastOrNull()
        if(last?.user!=user || last.assistant!=result) {
            history.add(ChatTurn(user,result))
            ChatStore.save(this,history)
        }
        lastAnswer=result
        renderHistory()
    }

    private fun restoreInferenceState() {
        val snap=BackgroundInferenceService.snapshot(this)
        when {
            BackgroundInferenceService.isRunning(this) -> {
                busy=true
                setBusyUi()
                renderHistory()
                if(snap.user.isNotBlank()) showPending(snap.user,snap.thinking)
                updateStatus(if(snap.thinking) "Thinking in background • CPU" else "Generating in background • CPU")
            }
            snap.state==BackgroundInferenceService.STATE_DONE && !snap.consumed -> {
                busy=false
                completeTurn(snap.user,snap.result)
                BackgroundInferenceService.markConsumed(this)
                setBusyUi()
                updateStatus("Answer ready • CPU")
            }
            snap.state==BackgroundInferenceService.STATE_ERROR && !snap.consumed -> {
                busy=false
                setBusyUi()
                renderHistory()
                addAssistantBubble(snap.error.ifBlank { "The previous generation stopped." },false)
                BackgroundInferenceService.markConsumed(this)
                updateStatus("Generation stopped")
            }
            else -> {
                busy=false
                setBusyUi()
                updateStatus()
            }
        }
    }

    private fun setBusyUi() {
        send.isEnabled=!busy
        thinkSwitch.isEnabled=!busy
        medicalSwitch.isEnabled=!busy
        stop.visibility=if(busy) View.VISIBLE else View.GONE
    }

    private fun newChat() {
        if(busy || BackgroundInferenceService.isRunning(this)) {
            Toast.makeText(this,"Stop the current generation first.",Toast.LENGTH_SHORT).show()
            return
        }
        history.clear()
        ChatStore.clear(this)
        BackgroundInferenceService.clearStoredState(this)
        lastAnswer=""
        renderHistory()
        updateStatus()
    }

    private fun updateStatus(custom:String?=null) {
        status.text=custom ?: when {
            BackgroundInferenceService.isRunning(this) -> "Local Qwen is working in background"
            modelFile.exists() -> "Qwen3 4B Q4_K_M • CPU • offline"
            else -> "Model not imported"
        }
    }

    private fun scrollBottom() {
        chatScroll.post { chatScroll.fullScroll(View.FOCUS_DOWN) }
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

    private fun speak(value:String) {
        if(!ttsReady) {
            Toast.makeText(this,"No offline TTS voice is ready.",Toast.LENGTH_SHORT).show()
            return
        }
        val spoken=value
            .replace(Regex("\\s*\\[\\d+\\]"),"")
            .replace(Regex("\\*\\*(.*?)\\*\\*"),"$1")
        tts?.speak(spoken,TextToSpeech.QUEUE_FLUSH,null,"qwen-answer")
    }

    private fun requestNotificationPermission() {
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),73)
        }
    }

    private fun modelDialog() {
        val box=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(dp(18),dp(8),dp(18),dp(8))
        }
        box.addView(label(
            if(modelFile.exists()) "Qwen3 4B Q4_K_M is imported." else "Import Qwen3 4B Q4_K_M (~2.5 GB).",
            16f
        ))
        box.addView(label("This separate app has its own Android sandbox, so it needs its own imported copy of the GGUF. If you still have the original download, select that file.",13f,muted))
        box.addView(button("Open model download") {
            startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(MODEL_URL)))
        })
        box.addView(button("Import GGUF") {
            if(busy || BackgroundInferenceService.isRunning(this)) {
                Toast.makeText(this,"Stop generation first.",Toast.LENGTH_SHORT).show()
            } else {
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    type="*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                },IMPORT_REQUEST)
            }
        })
        box.addView(label("Modes",17f).apply { typeface=Typeface.DEFAULT_BOLD })
        box.addView(label("Fast: /no_think, 160-token cap, Qwen-recommended non-thinking sampling.\nThink: /think, 384-token cap, Qwen-recommended thinking sampling.\nMedical: adds one short clinical system instruction. General: no system prompt.",13f,muted))
        box.addView(label("Local Qwen Assistant 0.1.1 · CPU only · 4096 context · background inference · no INTERNET permission",12f,muted))
        val scroll=ScrollView(this).apply { addView(box) }
        AlertDialog.Builder(this).setTitle("Model & runtime").setView(scroll).setPositiveButton("Close",null).show()
    }

    @Deprecated("Dependency-free preview")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode!=IMPORT_REQUEST || resultCode!=RESULT_OK)return
        val uri=data?.data ?: return
        if(busy)return

        busy=true
        setBusyUi()
        updateStatus("Importing model…")
        fileWorker.execute {
            val temp=File(filesDir,"qwen-import.tmp")
            try {
                contentResolver.openInputStream(uri)!!.use { source ->
                    val magic=ByteArray(4)
                    var n=0
                    while(n<4) {
                        val got=source.read(magic,n,4-n)
                        require(got>0) { "Empty file" }
                        n+=got
                    }
                    require(magic.contentEquals(byteArrayOf(71,71,85,70))) { "Selected file is not GGUF" }
                    temp.outputStream().use { out ->
                        out.write(magic)
                        val buffer=ByteArray(1024*1024)
                        var total=4L
                        while(true) {
                            val count=source.read(buffer)
                            if(count<0)break
                            total+=count
                            require(total<5L*1024*1024*1024) { "Model exceeds 5 GB" }
                            require(filesDir.usableSpace>count+64L*1024*1024) { "Insufficient storage" }
                            out.write(buffer,0,count)
                        }
                    }
                }
                if(modelFile.exists()) modelFile.delete()
                require(temp.renameTo(modelFile)) { "Could not finish import" }
                BackgroundInferenceService.invalidateModel()
                runOnUiThread {
                    busy=false
                    setBusyUi()
                    updateStatus("Model imported • ready")
                }
            } catch(t:Throwable) {
                temp.delete()
                runOnUiThread {
                    busy=false
                    setBusyUi()
                    updateStatus("Import failed")
                    Toast.makeText(this,t.message ?: "Import failed",Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
