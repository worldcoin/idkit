import SwiftUI
import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

struct QRCodeView: View {
    let url: URL
    var size: CGFloat = 200

    var body: some View {
        if let image = qrCodeImage(for: url, size: size) {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .padding(.vertical, 8)
        }
    }

    private func qrCodeImage(for url: URL, size: CGFloat) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        guard let data = url.absoluteString.data(using: .ascii) else { return nil }
        filter.message = data
        filter.correctionLevel = "H"
        guard let outputImage = filter.outputImage else { return nil }
        let scale = size / outputImage.extent.width
        let scaled = outputImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
