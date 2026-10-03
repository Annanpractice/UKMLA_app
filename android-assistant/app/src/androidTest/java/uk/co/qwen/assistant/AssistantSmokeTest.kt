package uk.co.qwen.assistant

import android.content.ComponentName
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AssistantSmokeTest {
    @Test fun appAndBackgroundServiceAreDeclaredOffline() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val pm=context.packageManager
        val service=pm.getServiceInfo(ComponentName(context,BackgroundInferenceService::class.java),0)
        assertFalse(service.exported)

        val permissions=pm.getPackageInfo(context.packageName,4096).requestedPermissions?.toList() ?: emptyList()
        assertTrue(permissions.contains("android.permission.FOREGROUND_SERVICE"))
        assertTrue(permissions.contains("android.permission.FOREGROUND_SERVICE_SPECIAL_USE"))
        assertFalse(permissions.contains("android.permission.INTERNET"))

        assertEquals("uk.co.qwen.assistant35",context.packageName)
        val launch=pm.getLaunchIntentForPackage(context.packageName)
        assertNotNull(launch)
    }

    @Test fun qwen35ActivityCanLaunchWithoutModel() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val context=instrumentation.targetContext
        val intent=Intent(context,Qwen35Activity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val activity=instrumentation.startActivitySync(intent)
        assertEquals(Qwen35Activity::class.java.name,activity.javaClass.name)
        activity.finish()
    }
}
