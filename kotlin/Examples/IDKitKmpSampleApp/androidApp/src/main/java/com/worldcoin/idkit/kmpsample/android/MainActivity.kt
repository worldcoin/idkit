package com.worldcoin.idkit.kmpsample.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.worldcoin.idkit.kmpsample.shared.SampleController
import com.worldcoin.idkit.kmpsample.shared.SampleEnvironment
import com.worldcoin.idkit.kmpsample.shared.SamplePreset

class MainActivity : ComponentActivity() {
    private val controller = SampleController()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        handleIntent(intent)

        setContent {
            SampleScreen(
                controller = controller,
                onOpenConnector = { url ->
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        controller.dispose()
    }

    private fun handleIntent(intent: Intent?) {
        val callbackUrl = intent?.data?.toString() ?: return
        controller.handleDeepLink(callbackUrl)
    }
}

@Composable
private fun SampleScreen(
    controller: SampleController,
    onOpenConnector: (String) -> Unit,
) {
    val state by controller.state.collectAsState()

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("IDKit KMP Sample", style = MaterialTheme.typography.headlineSmall)

                Text("Request", style = MaterialTheme.typography.titleMedium)
                FormField("App ID", state.appId, enabled = false) {}
                FormField("RP ID", state.rpId, enabled = false) {}
                FormField("Action", state.action) { controller.setAction(it) }
                FormField("Signal", state.signal) { controller.setSignal(it) }
                EnvironmentSelector(
                    selected = state.environment,
                    onSelect = { controller.setEnvironment(it) },
                )
                PresetSelector(
                    selected = state.preset,
                    onSelect = { controller.setPreset(it) },
                )

                Button(
                    onClick = { controller.generateRequest() },
                    enabled = !state.isLoading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (state.isLoading) "Generating..." else "Generate Connector URL")
                }

                state.connectorUrl?.let { connectorUrl ->
                    Text("Connector URL", style = MaterialTheme.typography.titleMedium)
                    Button(
                        onClick = { onOpenConnector(connectorUrl) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Open Connector URL")
                    }
                    SelectionContainer {
                        Text(connectorUrl, fontFamily = FontFamily.Monospace)
                    }
                }

                Text("Logs", style = MaterialTheme.typography.titleMedium)
                SelectionContainer {
                    Text(
                        text = state.logs.ifBlank { "No logs yet." },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 180.dp)
                            .border(1.dp, MaterialTheme.colorScheme.outline)
                            .padding(12.dp),
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
        }
    }
}

@Composable
private fun FormField(
    label: String,
    value: String,
    enabled: Boolean = true,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled,
        singleLine = true,
    )
}

@Composable
private fun EnvironmentSelector(
    selected: SampleEnvironment,
    onSelect: (SampleEnvironment) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Environment", style = MaterialTheme.typography.labelLarge)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SampleEnvironment.entries.forEach { environment ->
                if (selected == environment) {
                    FilledTonalButton(onClick = {}, modifier = Modifier.weight(1f)) {
                        Text(environment.label)
                    }
                } else {
                    OutlinedButton(
                        onClick = { onSelect(environment) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(environment.label)
                    }
                }
            }
        }
    }
}

@Composable
private fun PresetSelector(
    selected: SamplePreset,
    onSelect: (SamplePreset) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Preset", style = MaterialTheme.typography.labelLarge)

        SamplePreset.entries
            .chunked(2)
            .forEach { rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    rowItems.forEach { preset ->
                        if (selected == preset) {
                            FilledTonalButton(onClick = {}, modifier = Modifier.weight(1f)) {
                                Text(preset.label)
                            }
                        } else {
                            OutlinedButton(
                                onClick = { onSelect(preset) },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(preset.label)
                            }
                        }
                    }
                }
            }
    }
}
