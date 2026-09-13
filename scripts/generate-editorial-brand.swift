import Foundation
import CoreText
import CoreGraphics

struct Request: Decodable {
    let id: String
    let text: String
    let font: String
    let size: Double
    let tracking: Double
}

for path in CommandLine.arguments.dropFirst() {
    CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: path) as CFURL, .process, nil)
}
let requests = try JSONDecoder().decode([Request].self, from: FileHandle.standardInput.readDataToEndOfFile())
var output: [String: [String: Any]] = [:]
func number(_ n: CGFloat) -> String { String(format: "%.3f", Double(n)) }
for request in requests {
    let font = CTFontCreateWithName(request.font as CFString, request.size, nil)
    let string = NSAttributedString(string: request.text, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTKernAttributeName as String): request.tracking
    ])
    let line = CTLineCreateWithAttributedString(string)
    var commands = ""
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let count = CTRunGetGlyphCount(run)
        var glyphs = [CGGlyph](repeating: 0, count: count)
        var positions = [CGPoint](repeating: .zero, count: count)
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
        let attributes = CTRunGetAttributes(run) as NSDictionary
        let runFont = attributes[kCTFontAttributeName] as! CTFont
        for index in 0..<count {
            guard let path = CTFontCreatePathForGlyph(runFont, glyphs[index], nil) else { continue }
            let offset = positions[index]
            func point(_ point: CGPoint) -> String { "\(number(point.x + offset.x)) \(number(-point.y - offset.y))" }
            path.applyWithBlock { pointer in
                let element = pointer.pointee
                switch element.type {
                case .moveToPoint: commands += "M\(point(element.points[0]))"
                case .addLineToPoint: commands += "L\(point(element.points[0]))"
                case .addQuadCurveToPoint: commands += "Q\(point(element.points[0])) \(point(element.points[1]))"
                case .addCurveToPoint: commands += "C\(point(element.points[0])) \(point(element.points[1])) \(point(element.points[2]))"
                case .closeSubpath: commands += "Z"
                @unknown default: break
                }
            }
        }
    }
    output[request.id] = ["path": commands, "width": CTLineGetTypographicBounds(line, nil, nil, nil), "resolvedFont": CTFontCopyPostScriptName(font) as String]
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]))
