import unittest

from app import extract_youtube_video_id

VIDEO_ID = "dQw4w9WgXcQ"


class YouTubeTests(unittest.TestCase):
    def test_watch(self):
        self.assertEqual(
            extract_youtube_video_id(
                f"https://www.youtube.com/watch?v={VIDEO_ID}&t=10"
            ),
            VIDEO_ID,
        )

    def test_short(self):
        self.assertEqual(
            extract_youtube_video_id(f"https://youtu.be/{VIDEO_ID}"),
            VIDEO_ID,
        )

    def test_shorts(self):
        self.assertEqual(
            extract_youtube_video_id(
                f"https://www.youtube.com/shorts/{VIDEO_ID}"
            ),
            VIDEO_ID,
        )

    def test_deeplink(self):
        self.assertEqual(
            extract_youtube_video_id(f"youtube://watch/{VIDEO_ID}"),
            VIDEO_ID,
        )

    def test_invalid_url(self):
        with self.assertRaises(ValueError):
            extract_youtube_video_id("https://example.com/test")


if __name__ == "__main__":
    unittest.main()
