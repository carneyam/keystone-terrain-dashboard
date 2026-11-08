from playwright.sync_api import sync_playwright


URL = (
    "https://www.keystoneresort.com/"
    "the-mountain/mountain-conditions/terrain-and-lift-status.aspx"
)


def main():
    print("Launching Chromium...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        page = browser.new_page()

        print("Loading Keystone terrain page...")

        page.goto(
            URL,
            wait_until="networkidle",
            timeout=60000,
        )

        html = page.content()

        print("Final URL:", page.url)
        print("HTML length:", len(html))
        print(
            "TerrainStatusFeed present:",
            "FR.TerrainStatusFeed" in html,
        )
        print(
            "River Run Gondola present:",
            "River Run Gondola" in html,
        )
        print(
            "Schoolmarm present:",
            "Schoolmarm" in html,
        )

        browser.close()


if __name__ == "__main__":
    main()