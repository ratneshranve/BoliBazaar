package com.bolibazaar.app

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Voice search inside the app: listens through the phone's speech recogniser (no pop-up, no Google screen)
 * and reports to JavaScript as events named "bbVoice":
 *   { type: "start" } · { type: "partial", text } · { type: "result", text } · { type: "error", code }
 * The microphone permission is asked for by the JS side before start().
 */
class VoiceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private var recognizer: SpeechRecognizer? = null

  override fun getName() = "BBVoice"

  private fun send(build: WritableMap.() -> Unit) {
    val map = Arguments.createMap().apply(build)
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("bbVoice", map)
  }

  private fun errorCode(error: Int) = when (error) {
    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language-not-supported"
    SpeechRecognizer.ERROR_CLIENT -> "cancelled"
    else -> "error"
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) = send { putString("type", "start") }
    override fun onPartialResults(partialResults: Bundle?) {
      val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
      send { putString("type", "partial"); putString("text", text) }
    }
    override fun onResults(results: Bundle?) {
      val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
      send { putString("type", "result"); putString("text", text) }
      release()
    }
    override fun onError(error: Int) {
      send { putString("type", "error"); putString("code", errorCode(error)) }
      release()
    }
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
  }

  private fun release() {
    recognizer?.destroy()
    recognizer = null
  }

  /** Start listening in `locale` (e.g. "en-IN"). Everything comes back as "bbVoice" events. */
  @ReactMethod
  fun start(locale: String) {
    UiThreadUtil.runOnUiThread {
      if (!SpeechRecognizer.isRecognitionAvailable(context)) {
        send { putString("type", "error"); putString("code", "service-not-allowed") }
        return@runOnUiThread
      }
      release()
      recognizer = SpeechRecognizer.createSpeechRecognizer(context).also { it.setRecognitionListener(listener) }
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
      }
      recognizer?.startListening(intent)
    }
  }

  /** Stop listening now; what was heard so far still comes back as the result. */
  @ReactMethod
  fun stop() {
    UiThreadUtil.runOnUiThread { recognizer?.stopListening() }
  }

  /** Give up: nothing is reported. */
  @ReactMethod
  fun cancel() {
    UiThreadUtil.runOnUiThread { release() }
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  override fun invalidate() {
    UiThreadUtil.runOnUiThread { release() }
    super.invalidate()
  }
}
