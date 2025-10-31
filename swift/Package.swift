// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IDKit",
    platforms: [
        .iOS(.v13),
        .macOS(.v10_15)
    ],
    products: [
        .library(
            name: "IDKit",
            targets: ["IDKit"]
        ),
    ],
    targets: [
        .target(
            name: "IDKit",
            dependencies: ["IDKitFFI"]
        ),
        .binaryTarget(
            name: "IDKitFFI",
            path: "./IDKitFFI.xcframework"
        ),
        .testTarget(
            name: "IDKitTests",
            dependencies: ["IDKit"]
        ),
    ]
)
