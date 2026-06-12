import SwiftUI
import WebKit

struct WebContentView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptEnabled = true
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor.systemBackground
        webView.scrollView.bounces = true
        webView.scrollView.isScrollEnabled = true
        
        let url = URL(string: "http://localhost:9000/")!
        let request = URLRequest(url: url)
        webView.load(request)
        
        return webView
    }
    
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
