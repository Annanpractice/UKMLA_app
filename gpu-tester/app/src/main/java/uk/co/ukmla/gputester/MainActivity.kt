package uk.co.ukmla.gputester
import android.app.*
import android.content.*
import android.net.Uri
import android.os.*
import android.provider.OpenableColumns
import android.view.WindowManager
import android.widget.*
import java.io.File

class MainActivity:Activity() {
 private lateinit var output:TextView
 private lateinit var model:TextView
 private lateinit var layers:Spinner
 private val handler=Handler(Looper.getMainLooper())
 private var service:Messenger?=null
 private var connection:ServiceConnection?=null
 private var active=false
 private var finished=false
 private var started=0L
 private val prefs get()=getSharedPreferences("tester",MODE_PRIVATE)
 private val log get()=File(filesDir,"probe.log")
 private val reply=Messenger(Handler(Looper.getMainLooper()) { msg -> if(msg.what==3) { finished=true;update() };true })
 private fun button(box:LinearLayout,text:String,action:()->Unit) { box.addView(Button(this).apply { this.text=text;isAllCaps=false;setOnClickListener { action() } }) }
 override fun onCreate(state:Bundle?) {
  super.onCreate(state)
  val scroll=ScrollView(this);val box=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(24,24,24,24) };scroll.addView(box);setContentView(scroll)
  box.setOnApplyWindowInsetsListener { v,i -> v.setPadding(24,i.systemWindowInsetTop+20,24,i.systemWindowInsetBottom+20);i }
  box.addView(TextView(this).apply { text="UKMLA GPU Tester · 0.1.1";textSize=24f })
  box.addView(TextView(this).apply { text="Separate offline diagnostic app. Select your existing Qwen GGUF in Downloads. No model copying or downloading. Close the reader before testing to free its memory. Keep this screen open.\n\nEach test uses the same short prompt, 4 CPU threads, 2,048 context, batch 64 and up to 32 output tokens. GPU tests never silently substitute a CPU test." })
  model=TextView(this);box.addView(model);model.text=prefs.getString("name","No model selected")
  button(box,"Select existing GGUF") { if(!active) startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="*/*";addCategory(Intent.CATEGORY_OPENABLE);addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) },10) }
  box.addView(TextView(this).apply { text="GPU layers (start with 1; increase only after a clean test)" })
  layers=Spinner(this).apply { adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,listOf("1","2","4","8","16","99 (all)")) };box.addView(layers)
  button(box,"Run CPU test") { runTest("cpu") }
  button(box,"Run OPENCL (Adreno) test") { runTest("opencl") }
  button(box,"Run OPENCL (generic) test") { runTest("opencl_generic") }
  button(box,"Run VULKAN test") { runTest("vulkan") }
  button(box,"Stop test") { stop("User requested stop") }
  button(box,"Copy diagnostic report") { (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("GPU test",report()));Toast.makeText(this,"Report copied — paste it into chat",Toast.LENGTH_LONG).show() }
  button(box,"Save full report") { startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply { type="text/plain";putExtra(Intent.EXTRA_TITLE,"UKMLA-GPU-test.txt") },11) }
  output=TextView(this).apply { textSize=12f;setTextIsSelectable(true) };box.addView(output)
  update();handler.post(tick)
 }
 private val tick=object:Runnable { override fun run() { update();if(active && System.currentTimeMillis()-started>300000) stop("Five-minute timeout");handler.postDelayed(this,1500) } }
 private fun update() { if(::output.isInitialized) output.text=report().takeLast(16000) }
 private fun report():String {
  val text=if(log.exists()) log.readText() else "No tests run yet."
  val exits=if(Build.VERSION.SDK_INT>=30) {
   try { (getSystemService(ACTIVITY_SERVICE) as ActivityManager).getHistoricalProcessExitReasons(null,0,8).filter { it.processName.endsWith(":probe") && it.timestamp>=prefs.getLong("start",0L) }.joinToString("\n") { "Android exit: time=${it.timestamp}, reason=${it.reason}, status=${it.status}, description=${it.description}, PSS=${it.pss} KB, RSS=${it.rss} KB" } } catch(e:Exception) { "Exit information unavailable: ${e.message}" }
  } else "Android exit history requires Android 11+."
  return text+"\n\n"+exits+"\nReason codes: 2=signal, 3=low memory, 4=Java crash, 5=native crash, 6=ANR. A tester stop/normal worker shutdown can also report a signal. These are app diagnostics, not unrestricted system logcat."
 }
 private fun runTest(backend:String) {
  if(active) { Toast.makeText(this,"Wait or stop the current test",Toast.LENGTH_SHORT).show();return }
  val uri=prefs.getString("uri",null) ?: run { Toast.makeText(this,"Select your GGUF first",Toast.LENGTH_SHORT).show();return }
  started=System.currentTimeMillis();prefs.edit().putLong("start",started).apply();finished=false
  if(log.exists()) log.copyTo(File(filesDir,"previous-probe.log"),true)
  val memory=ActivityManager.MemoryInfo();(getSystemService(ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(memory)
  log.writeText("UKMLA GPU Tester 0.1.1\nStart: $started\nDevice: ${Build.MANUFACTURER} ${Build.MODEL}\nAndroid: ${Build.VERSION.RELEASE} API ${Build.VERSION.SDK_INT}\nBuild: ${Build.DISPLAY}\nABI: ${Build.SUPPORTED_ABIS.joinToString()}\nAvailable memory: ${memory.availMem/1048576} MiB; total: ${memory.totalMem/1048576} MiB\nModel: ${prefs.getString("name","")}\nRequested backend: $backend\nllama.cpp: ec91ab5add06555970f98d9c5361d884f3f530f8\nSTAGE: binding worker\n")
  val gpuLayers=layers.selectedItem.toString().substringBefore(" ").toInt()
  val conn=object:ServiceConnection {
   override fun onServiceConnected(name:ComponentName,binder:IBinder) {
    service=Messenger(binder)
    try { service!!.send(Message.obtain(null,1).apply { replyTo=reply;data=Bundle().apply { putString("backend",backend);putString("uri",uri);putInt("layers",if(backend=="cpu") 0 else gpuLayers) } }) } catch(e:Exception) { stop("Could not start worker: ${e.message}") }
   }
   override fun onServiceDisconnected(name:ComponentName) { log.appendText(if(finished) "Worker exited after test.\n" else "Worker disconnected before completion — inspect Android exit information.\n");release();update() }
   override fun onBindingDied(name:ComponentName) { release();update() }
  }
  connection=conn;active=true;window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  if(!bindService(Intent(this,ProbeService::class.java),conn,BIND_AUTO_CREATE)) stop("Worker binding failed")
 }
 private fun release() { connection?.let { try { unbindService(it) } catch(_:Exception) {} };connection=null;service=null;active=false;window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
 private fun stop(reason:String) { if(!active)return;log.appendText("TEST STOP: $reason\n");try { service?.send(Message.obtain(null,2)) } catch(_:Exception) {};release();update() }
 override fun onDestroy() { stop("Tester activity closed");handler.removeCallbacksAndMessages(null);super.onDestroy() }
 @Deprecated("Native preview") override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
  super.onActivityResult(requestCode,resultCode,data);val uri=data?.data ?: return;if(resultCode!=RESULT_OK)return
  try {
   if(requestCode==10) {
    contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION)
    var name="Selected GGUF"
    contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { if(it.moveToFirst()) name=it.getString(0) }
    prefs.edit().putString("uri",uri.toString()).putString("name",name).apply();model.text=name
   } else if(requestCode==11) contentResolver.openOutputStream(uri)?.use { it.write(report().toByteArray()) }
  } catch(e:Exception) { Toast.makeText(this,e.message,Toast.LENGTH_LONG).show() }
 }
}
