// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "IDKit",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "IDKit",
            targets: ["IDKit"]),
    ],
    targets: [
        .target(
            name: "IDKit",
            dependencies: [],
            path: "Sources/IDKit",
            exclude: [
                "Generated/idkitFFI.h",
                "Generated/idkitFFI.modulemap",
                "Generated/idkit_coreFFI.h",
                "Generated/idkit_coreFFI.modulemap"
            ]
        ),
        .testTarget(
            name: "IDKitTests",
            dependencies: ["IDKit"]),
    ]
)
