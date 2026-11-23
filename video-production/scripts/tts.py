import sys, asyncio, certifi
certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
import edge_tts
voice, text, out = sys.argv[1], sys.argv[2], sys.argv[3]
rate = sys.argv[4] if len(sys.argv) > 4 else "+0%"
async def main():
    await edge_tts.Communicate(text, voice, rate=rate).save(out)
asyncio.run(main())
