package uk.co.ukmla.reader

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.util.concurrent.Executors

class BackgroundInferenceService : Service() {
    companion object {
        const val ACTION_START = "uk.co.ukmla.reader.action.START_INFERENCE"
        const val ACTION_CANCEL = "uk.co.ukmla.reader.action.CANCEL_INFERENCE"
        const val ACTION_STATE = "uk.co.ukmla.reader.action.INFERENCE_STATE"

        const val EXTRA_PROMPT = "prompt"
        const val EXTRA_MODEL_PATH = "model_path"
        const val EXTRA_QUESTION = "question"
        const val EXTRA_DISPLAY = "display"
        const val EXTRA_SOURCE_BACKED = "source_backed"
        const val EXTRA_STATE = "state"
        const val EXTRA_RESULT = "result"
        const val EXTRA_ERROR = "error"
        const val EXTRA_SHOW_INFERENCE = "show_inference"

        const val PREFS = "background_inference"
        const val KEY_STATE = "state"
        const val KEY_RESULT = "result"
        const val KEY_ERROR = "error"
        const val KEY_QUESTION = "question"
        const val KEY_DISPLAY = "display"
        const val KEY_SOURCE_BACKED = "source_backed"

        const val STATE_IDLE = "idle"
        const val STATE_RUNNING = "running"
        const val STATE_DONE = "done"
        const val STATE_ERROR = "error"
        const val STATE_CANCELLED = "cancelled"

        private const val WORK_CHANNEL = "local_inference_work"
        private const val RESULT_CHANNEL = "local_inference_result"
        private const val WORK_NOTIFICATION = 2201
        private const val RESULT_NOTIFICATION = 2202

        @Volatile private var loadedModelPath: String? = null

        fun isRunning(context: Context): Boolean =
            context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_STATE, STATE_IDLE) == STATE_RUNNING

        fun invalidateModel() {
            loadedModelPath = null
        }
    }

    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var running = false
    @Volatile private var cancelRequested = false

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when(intent?.action) {
            ACTION_CANCEL -> requestCancel()
            ACTION_START -> if(!running) startInference(intent)
        }
        return START_NOT_STICKY
    }

    private fun startInference(intent: Intent) {
        val prompt = intent.getStringExtra(EXTRA_PROMPT).orEmpty()
        val modelPath = intent.getStringExtra(EXTRA_MODEL_PATH).orEmpty()
        val question = intent.getStringExtra(EXTRA_QUESTION).orEmpty()
        val display = intent.getStringExtra(EXTRA_DISPLAY).orEmpty()
        val sourceBacked = intent.getBooleanExtra(EXTRA_SOURCE_BACKED, false)

        if(prompt.isBlank() || modelPath.isBlank()) {
            finishWith(STATE_ERROR, "", "Missing prompt or model path.", question, display, sourceBacked)
            return
        }

        running = true
        cancelRequested = false
        saveState(STATE_RUNNING, "", "", question, display, sourceBacked)
        startForegroundCompat(workNotification(display))
        broadcast(STATE_RUNNING, "", "", question, sourceBacked)

        worker.execute {
            try {
                if(loadedModelPath != modelPath) {
                    Native.load(modelPath)
                    loadedModelPath = modelPath
                }
                val raw = if(cancelRequested) ByteArray(0) else Native.generate(prompt)
                if(cancelRequested) {
                    finishWith(STATE_CANCELLED, "", "", question, display, sourceBacked)
                } else {
                    val result = ReaderLogic.visibleAnswer(raw.toString(Charsets.UTF_8))
                    if(result.isBlank()) {
                        finishWith(STATE_ERROR, "", "No usable answer was generated.", question, display, sourceBacked)
                    } else {
                        finishWith(STATE_DONE, result, "", question, display, sourceBacked)
                    }
                }
            } catch(t: Throwable) {
                finishWith(
                    STATE_ERROR,
                    "",
                    t.message ?: "Unable to run the local model.",
                    question,
                    display,
                    sourceBacked
                )
            }
        }
    }

    private fun requestCancel() {
        if(!running) {
            stopSelf()
            return
        }
        cancelRequested = true
        Native.cancel()
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(WORK_NOTIFICATION, workNotification("Stopping local generation…"))
    }

    private fun finishWith(
        state: String,
        result: String,
        error: String,
        question: String,
        display: String,
        sourceBacked: Boolean
    ) {
        running = false
        saveState(state, result, error, question, display, sourceBacked)
        broadcast(state, result, error, question, sourceBacked)

        if(Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
        else @Suppress("DEPRECATION") stopForeground(true)

        when(state) {
            STATE_DONE -> getSystemService(NotificationManager::class.java)
                .notify(RESULT_NOTIFICATION, resultNotification("Answer ready", "Tap to read the completed UKMLA explanation."))
            STATE_ERROR -> getSystemService(NotificationManager::class.java)
                .notify(RESULT_NOTIFICATION, resultNotification("Generation failed", error.take(120)))
            STATE_CANCELLED -> getSystemService(NotificationManager::class.java).cancel(RESULT_NOTIFICATION)
        }
        stopSelf()
    }

    private fun saveState(
        state: String,
        result: String,
        error: String,
        question: String,
        display: String,
        sourceBacked: Boolean
    ) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString(KEY_STATE, state)
            .putString(KEY_RESULT, result)
            .putString(KEY_ERROR, error)
            .putString(KEY_QUESTION, question)
            .putString(KEY_DISPLAY, display)
            .putBoolean(KEY_SOURCE_BACKED, sourceBacked)
            .apply()
    }

    private fun broadcast(state: String, result: String, error: String, question: String, sourceBacked: Boolean) {
        sendBroadcast(Intent(ACTION_STATE).setPackage(packageName).apply {
            putExtra(EXTRA_STATE, state)
            putExtra(EXTRA_RESULT, result)
            putExtra(EXTRA_ERROR, error)
            putExtra(EXTRA_QUESTION, question)
            putExtra(EXTRA_SOURCE_BACKED, sourceBacked)
        })
    }

    private fun createChannels() {
        if(Build.VERSION.SDK_INT < 26) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(WORK_CHANNEL, "Local model generation", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows when the offline language model is generating in the background."
                setSound(null, null)
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(RESULT_CHANNEL, "Local model results", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Alerts when an offline language-model answer is ready."
            }
        )
    }

    private fun openAppPendingIntent(): PendingIntent {
        val open = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_SHOW_INFERENCE, true)
        return PendingIntent.getActivity(
            this, 2201, open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun cancelPendingIntent(): PendingIntent {
        val cancel = Intent(this, BackgroundInferenceService::class.java).setAction(ACTION_CANCEL)
        return PendingIntent.getService(
            this, 2202, cancel,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun notificationBuilder(channel: String): Notification.Builder =
        if(Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channel) else Notification.Builder(this)

    private fun workNotification(display: String): Notification =
        notificationBuilder(WORK_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("UKMLA is generating locally")
            .setContentText(if(display.isBlank()) "CPU inference is running. You can use other apps." else display.take(90))
            .setContentIntent(openAppPendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", cancelPendingIntent())
            .build()

    private fun resultNotification(title: String, message: String): Notification =
        notificationBuilder(RESULT_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title)
            .setContentText(message)
            .setContentIntent(openAppPendingIntent())
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_STATUS)
            .build()

    private fun startForegroundCompat(notification: Notification) {
        if(Build.VERSION.SDK_INT >= 34) {
            startForeground(WORK_NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(WORK_NOTIFICATION, notification)
        }
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }
}
