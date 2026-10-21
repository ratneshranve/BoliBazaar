package com.bolibazaar.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Voice search: opens the phone's own "Speak now" dialog (Google voice input) and returns what was said.
 * The dialog asks for the microphone itself, so the app needs no RECORD_AUDIO permission.
 */
class VoiceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), ActivityEventListener {

  private var pending: Promise? = null

  init {
    context.addActivityEventListener(this)
  }

  override fun getName() = "BBVoice"

  /** Resolves with the spoken text, or null when the user closed the dialog / nothing was understood. */
  @ReactMethod
  fun listen(locale: String, prompt: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "The app is not in front")
      return
    }
    if (pending != null) {
      promise.reject("BUSY", "Already listening")
      return
    }
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
      putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }
    pending = promise
    try {
      activity.startActivityForResult(intent, REQUEST_SPEECH)
    } catch (e: ActivityNotFoundException) {
      pending = null
      promise.reject("NO_VOICE_APP", "No voice input app on this phone")
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_SPEECH) return
    val promise = pending ?: return
    pending = null
    val said = if (resultCode == Activity.RESULT_OK) data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull() else null
    promise.resolve(said)
  }

  override fun onNewIntent(intent: Intent) {}

  companion object {
    private const val REQUEST_SPEECH = 7151
  }
}
