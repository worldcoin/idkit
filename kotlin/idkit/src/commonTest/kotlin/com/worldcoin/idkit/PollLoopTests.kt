package com.worldcoin.idkit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class PollLoopTests {

    private fun requestReturning(pollStatusProvider: suspend () -> IDKitStatus): IDKitRequest =
        IDKitRequest.forTesting(
            connectorURI = "https://world.org/verify?t=wld",
            requestId = "7a6ff287-c95f-4330-b3de-9447f77ca3f9",
            pollStatusProvider = pollStatusProvider,
        )

    @Test
    fun pollUntilCompletionSuccessPath() = runTest {
        val statuses = ArrayDeque(
            listOf(
                IDKitStatus.WaitingForConnection,
                IDKitStatus.AwaitingConfirmation,
                IDKitStatus.Confirmed(sampleResult()),
            ),
        )
        val request = requestReturning { statuses.removeFirstOrNull() ?: IDKitStatus.WaitingForConnection }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 1u, timeoutMs = 60_000u))
        assertEquals(IDKitCompletionResult.Success(sampleResult()), completion)
    }

    @Test
    fun pollUntilCompletionTimeoutPath() = runTest {
        val request = requestReturning { IDKitStatus.WaitingForConnection }

        // timeoutMs = 0 makes the deadline check deterministic under virtual time.
        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 5u, timeoutMs = 0u))
        assertEquals(IDKitCompletionResult.Failure(IDKitErrorCode.TIMEOUT), completion)
    }

    @Test
    fun pollUntilCompletionCancellationPath() = runTest {
        val request = requestReturning { throw CancellationException("test cancellation") }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 200u, timeoutMs = 10_000u))
        assertEquals(IDKitCompletionResult.Failure(IDKitErrorCode.CANCELLED), completion)
    }

    @Test
    fun pollUntilCompletionRecoversFromNetworkingErrors() = runTest {
        val statuses = ArrayDeque(
            listOf(
                IDKitStatus.WaitingForConnection,
                IDKitStatus.NetworkingError(IDKitErrorCode.CONNECTION_FAILED),
                IDKitStatus.NetworkingError(IDKitErrorCode.CONNECTION_FAILED),
                IDKitStatus.AwaitingConfirmation,
                IDKitStatus.Confirmed(sampleResult()),
            ),
        )
        val request = requestReturning { statuses.removeFirstOrNull() ?: IDKitStatus.WaitingForConnection }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 1u, timeoutMs = 60_000u))
        assertEquals(IDKitCompletionResult.Success(sampleResult()), completion)
    }

    @Test
    fun pollUntilCompletionAppFailurePath() = runTest {
        val request = requestReturning { IDKitStatus.Failed(IDKitErrorCode.USER_REJECTED) }

        val completion = request.pollUntilCompletion(IDKitPollOptions(pollIntervalMs = 1u, timeoutMs = 60_000u))
        assertEquals(IDKitCompletionResult.Failure(IDKitErrorCode.USER_REJECTED), completion)
    }

    @Test
    fun statusFlowEmitsDistinctStatesAndCompletes() = runTest {
        val statuses = ArrayDeque(
            listOf(
                IDKitStatus.WaitingForConnection,
                IDKitStatus.WaitingForConnection,
                IDKitStatus.NetworkingError(IDKitErrorCode.CONNECTION_FAILED),
                IDKitStatus.AwaitingConfirmation,
                IDKitStatus.Confirmed(sampleResult()),
            ),
        )
        val request = requestReturning { statuses.removeFirstOrNull() ?: IDKitStatus.WaitingForConnection }

        val emitted = mutableListOf<IDKitStatus>()
        request.statusFlow(pollIntervalMs = 1u).collect { emitted.add(it) }

        assertEquals(
            listOf(
                IDKitStatus.WaitingForConnection,
                IDKitStatus.AwaitingConfirmation,
                IDKitStatus.Confirmed(sampleResult()),
            ),
            emitted,
        )
    }
}
