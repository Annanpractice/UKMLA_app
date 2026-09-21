package uk.co.ukmla.gputester
import android.app.Service
import android.content.Intent
import android.net.Uri
import android.os.*
import java.io.File
import java.io.FileOutputStream

object ProbeNative { external fun run(fd:Int, log:String, layers:Int):ByteArray }
class ProbeService: Service() {
 private var started=false
 private val messenger=Messenger(Handler(Looper.getMainLooper()) { msg ->
  if(msg.what==2) { android.os.Process.killProcess(android.os.Process.myPid());true }
  else if(msg.what==1 && !started) {
   started=true
   val args=msg.data;val reply=msg.replyTo
   Thread {
    val log=File(filesDir,"probe.log")
    fun stage(s:String) { FileOutputStream(log,true).use { it.write((s+"\n").toByteArray());it.fd.sync() } }
    try {
     val backend=args.getString("backend")!!
     stage("STAGE: loading native library $backend; worker PID=${android.os.Process.myPid()}")
     System.loadLibrary("probe_$backend")
     stage("STAGE: opening selected model (read-only, no copy)")
     contentResolver.openFileDescriptor(Uri.parse(args.getString("uri")),"r")!!.use { fd ->
      val result=ProbeNative.run(fd.fd,log.path,args.getInt("layers")).toString(Charsets.UTF_8)
      stage(result)
     }
    } catch(t:Throwable) { stage("TEST ERROR: ${t.javaClass.simpleName}: ${t.message}") }
    finally {
     stage("STAGE: worker finished")
     try { reply.send(Message.obtain(null,3)) } catch(_:Exception) {}
     // A fresh process for every backend prevents driver state or loaded models leaking into the next test.
     Handler(Looper.getMainLooper()).postDelayed({ android.os.Process.killProcess(android.os.Process.myPid()) },300)
    }
   }.start();true
  } else true
 })
 override fun onBind(intent:Intent)=messenger.binder
 override fun onUnbind(intent:Intent):Boolean { android.os.Process.killProcess(android.os.Process.myPid());return false }
}
