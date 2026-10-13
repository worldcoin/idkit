package com.worldcoin.idkit

import java.math.BigInteger

typealias Nullifier = uniffi.idkit_core.Nullifier

fun Nullifier.toBigInteger(): BigInteger = BigInteger(toDecimalString())
