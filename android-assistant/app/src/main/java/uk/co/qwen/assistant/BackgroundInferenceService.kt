package uk.co.qwen.assistant

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.util.concurrent.Executors

data class InferenceSnapshot(
    val state:String,
    val user:String,
    val result:String,
    val error:String,
    val thinking:Boolean,
    val medical:Boolean,
    val consumed:Boolean
)

class BackgroundInferenceService : Service() {
    companion object {
        const val ACTION_START="uk.co.qwen.assistant.START"
        const val ACTION_CANCEL="uk.co.qwen.assistant.CANCEL"
        const val ACTION_STATE="uk.co.qwen.assistant.STATE"

        const val EXTRA_PROMPT="prompt"
        const val EXTRA_MODEL_PATH="model_path"
        const val EXTRA_USER="user"
        const val EXTRA_THINKING="thinking"
        const val EXTRA_MEDICAL="medical"
        const val EXTRA_MAX_TOKENS="max_tokens"
        const val EXTRA_STATE="state"
        const val EXTRA_RESULT="result"
        const val EXTRA_ERROR="error"
        const val EXTRA_SHOW_RESULT="show_result"

        private const val PREFS="inference_state"
        private const val KEY_STATE="state"
        private const val KEY_USER="user"
        private const val KEY_RESULT="result"
        private const val KEY_ERROR="error"
        private const val KEY_THINKING="thinking"
        private const val KEY_MEDICAL="medical"
        private const val KEY_CONSUMED="consumed"
        private const val KEY_STARTED_AT="started_at"

        const val STATE_IDLE="idle"
        const val STATE_RUNNING="running"
        const val STATE_DONE="done"
        const val STATE_ERROR="error"
        const val STATE_CANCELLED="cancelled"

        private const val WORK_CHANNEL="qwen_inference"
        private const val RESULT_CHANNEL="qwen_results"
        private const val WORK_NOTIFICATION=3101
        private const val RESULT_NOTIFICATION=3102

        @Volatile private var loadedModelPath:String?=null

        fun snapshot(context:Context):InferenceSnapshot {
            val p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
            return InferenceSnapshot(
                p.getString(KEY_STATE,STATE_IDLE) ?: STATE_IDLE,
                p.getString(KEY_USER,"").orEmpty(),
                p.getString(KEY_RESULT,"").orEmpty(),
                p.getString(KEY_ERROR,"").orEmpty(),
                p.getBoolean(KEY_THINKING,false),
                p.getBoolean(KEY_MEDICAL,false),
                p.getBoolean(KEY_CONSUMED,false)
            )
        }

        fun isRunning(context:Context):Boolean {
            val p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
            if(p.getString(KEY_STATE,STATE_IDLE)!=STATE_RUNNING)return false
            val started=p.getLong(KEY_STARTED_AT,0L)
            val stale=started<=0L || System.currentTimeMillis()-started>45L*60L*1000L
            if(stale) {
                p.edit()
                    .putString(KEY_STATE,STATE_ERROR)
                    .putString(KEY_ERROR,"The previous local generation was interrupted.")
                    .putLong(KEY_STARTED_AT,0L)
                    .apply()
                return false
            }
            return true
        }

        fun markConsumed(context:Context) {
            context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putBoolean(KEY_CONSUMED,true).apply()
        }

        fun clearStoredState(context:Context) {
            if(!isRunning(context)) {
                context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().clear().apply()
            }
        }

        fun invalidateModel() {
            loadedModelPath=null
        }
    }

    private val worker=Executors.newSingleThreadExecutor()
    @Volatile private var running=false
    @Volatile private var cancelRequested=false

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    override fun onBind(intent:Intent?):IBinder?=null

    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        when(intent?.action) {
            ACTION_CANCEL -> cancelGeneration()
            ACTION_START -> if(!running) startGeneration(intent)
        }
        return START_NOT_STICKY
    }

    private fun startGeneration(intent:Intent) {
        val prompt=intent.getStringExtra(EXTRA_PROMPT).orEmpty()
        val modelPath=intent.getStringExtra(EXTRA_MODEL_PATH).orEmpty()
        val user=intent.getStringExtra(EXTRA_USER).orEmpty()
        val thinking=intent.getBooleanExtra(EXTRA_THINKING,false)
        val medical=intent.getBooleanExtra(EXTRA_MEDICAL,false)
        val maxTokens=intent.getIntExtra(EXTRA_MAX_TOKENS,if(thinking)384 else 160)

        if(prompt.isBlank() || modelPath.isBlank()) {
            finish(STATE_ERROR,user,"","Missing prompt or model path.",thinking,medical)
            return
        }

        running=true
        cancelRequested=false
        save(STATE_RUNNING,user,"","",thinking,medical,false,System.currentTimeMillis())
        startForegroundCompat(workNotification(thinking))
        broadcast(STATE_RUNNING,user,"","",thinking,medical)

        worker.execute {
            try {
                if(loadedModelPath!=modelPath) {
                    Native.load(modelPath)
                    loadedModelPath=modelPath
                }
                val raw=if(cancelRequested) ByteArray(0) else Native.generate(prompt,maxTokens,thinking)
                if(cancelRequested) {
                    finish(STATE_CANCELLED,user,"","",thinking,medical)
                } else {
                    val visible=PromptBuilder.visibleAnswer(raw.toString(Charsets.UTF_8),thinking)
                    if(visible.isBlank()) {
                        val message=if(thinking)
                            "Think mode used its reasoning budget before reaching a final answer. Retry with a narrower question or use Fast mode."
                        else "Qwen returned no usable answer."
                        finish(STATE_ERROR,user,"",message,thinking,medical)
                    } else {
                        finish(STATE_DONE,user,visible,"",thinking,medical)
                    }
                }
            } catch(t:Throwable) {
                finish(STATE_ERROR,user,"",t.message ?: "Local Qwen generation failed.",thinking,medical)
            }
        }
    }

    private fun cancelGeneration() {
        if(!running) {
            stopSelf()
            return
        }
        cancelRequested=true
        Native.cancel()
        getSystemService(NotificationManager::class.java)
            .notify(WORK_NOTIFICATION,workNotification(false,"Stopping local generation…"))
    }

    private fun finish(
        state:String,
        user:String,
        result:String,
        error:String,
        thinking:Boolean,
        medical:Boolean
    ) {
        running=false
        save(state,user,result,error,thinking,medical,false,0L)
        broadcast(state,user,result,error,thinking,medical)
        stopForeground(STOP_FOREGROUND_REMOVE)

        val manager=getSystemService(NotificationManager::class.java)
        when(state) {
            STATE_DONE -> manager.notify(
                RESULT_NOTIFICATION,
                resultNotification("Answer ready",if(thinking) "Qwen finished thinking. Tap to read." else "Qwen finished. Tap to read.")
            )
            STATE_ERROR -> manager.notify(
                RESULT_NOTIFICATION,
                resultNotification("Generation stopped",error.take(120))
            )
            STATE_CANCELLED -> manager.cancel(RESULT_NOTIFICATION)
        }
        stopSelf()
    }

    private fun save(
        state:String,
        user:String,
        result:String,
        error:String,
        thinking:Boolean,
        medical:Boolean,
        consumed:Boolean,
        startedAt:Long
    ) {
        getSharedPreferences(PREFS,MODE_PRIVATE).edit()
            .putString(KEY_STATE,state)
            .putString(KEY_USER,user)
            .putString(KEY_RESULT,result)
            .putString(KEY_ERROR,error)
            .putBoolean(KEY_THINKING,thinking)
            .putBoolean(KEY_MEDICAL,medical)
            .putBoolean(KEY_CONSUMED,consumed)
            .putLong(KEY_STARTED_AT,startedAt)
            .apply()
    }

    private fun broadcast(
        state:String,
        user:String,
        result:String,
        error:String,
        thinking:Boolean,
        medical:Boolean
    ) {
        sendBroadcast(Intent(ACTION_STATE).setPackage(packageName).apply {
            putExtra(EXTRA_STATE,state)
            putExtra(EXTRA_USER,user)
            putExtra(EXTRA_RESULT,result)
            putExtra(EXTRA_ERROR,error)
            putExtra(EXTRA_THINKING,thinking)
            putExtra(EXTRA_MEDICAL,medical)
        })
    }

    private fun createChannels() {
        if(Build.VERSION.SDK_INT<26)return
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(WORK_CHANNEL,"Local Qwen generation",NotificationManager.IMPORTANCE_LOW).apply {
                description="Shows while the on-device Qwen model is generating."
                setSound(null,null)
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(RESULT_CHANNEL,"Local Qwen results",NotificationManager.IMPORTANCE_DEFAULT).apply {
                description="Alerts when an on-device answer is ready."
            }
        )
    }

    private fun openAppPendingIntent():PendingIntent {
        val open=Intent(this,MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_SHOW_RESULT,true)
        return PendingIntent.getActivity(
            this,3101,open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun stopPendingIntent():PendingIntent =
        PendingIntent.getService(
            this,3102,
            Intent(this,BackgroundInferenceService::class.java).setAction(ACTION_CANCEL),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun builder(channel:String):Notification.Builder =
        if(Build.VERSION.SDK_INT>=26) Notification.Builder(this,channel) else Notification.Builder(this)

    private fun workNotification(thinking:Boolean,text:String?=null):Notification =
        builder(WORK_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(if(thinking) "Qwen is thinking locally" else "Qwen is answering locally")
            .setContentText(text ?: "CPU inference is running. You can use other apps.")
            .setContentIntent(openAppPendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel,"Stop",stopPendingIntent())
            .build()

    private fun resultNotification(title:String,message:String):Notification =
        builder(RESULT_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title)
            .setContentText(message)
            .setContentIntent(openAppPendingIntent())
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_STATUS)
            .build()

    private fun startForegroundCompat(notification:Notification) {
        if(Build.VERSION.SDK_INT>=34) {
            startForeground(WORK_NOTIFICATION,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(WORK_NOTIFICATION,notification)
        }
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }
}
