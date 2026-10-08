# -*- coding: utf-8 -*-
"""
Generate a high-resolution, ultra-crisp Mindmap Infographic image tailored specifically for:
[Pure 24K Gold Bar Bullion Sales & Scrap Gold (고금) Buying Business Model]
No retail jewelry. 100% focused on scrap exchange, bullion churning, refinery spreads, and VIP agent comps.
"""

import os
from PIL import Image, ImageDraw, ImageFont

# Canvas dimensions
WIDTH = 2200
HEIGHT = 1350

# Colors
BG_COLOR = (11, 15, 25)            # Deep navy background #0B0F19
CARD_BG = (22, 31, 48)             # Slate card #161F30
CARD_BORDER = (45, 59, 85)         # Subtle border
GOLD_BORDER = (212, 175, 55)       # Luxury Gold #D4AF37
GOLD_ACCENT = (245, 158, 11)       # Bright gold
GREEN_PROFIT = (16, 185, 129)      # Emerald profit #10B981
GREEN_BG = (6, 78, 59)             # Dark green fill
RED_LOSS = (244, 63, 94)           # Coral red #F43F5E
RED_BG = (76, 29, 36)              # Dark red fill
BLUE_CYAN = (56, 189, 248)         # Cyan process #38BDF8
PURPLE_AGENT = (168, 85, 247)      # Purple agent #A855F7
TEXT_WHITE = (248, 250, 252)       # Slate 50
TEXT_MUTED = (148, 163, 184)       # Slate 400
TEXT_SUB = (203, 213, 225)         # Slate 300

# Fonts
font_title = ImageFont.truetype("malgunbd.ttf", 44)
font_subtitle = ImageFont.truetype("malgun.ttf", 22)
font_h1 = ImageFont.truetype("malgunbd.ttf", 25)
font_h2 = ImageFont.truetype("malgunbd.ttf", 21)
font_body = ImageFont.truetype("malgun.ttf", 18)
font_body_bold = ImageFont.truetype("malgunbd.ttf", 18)
font_small = ImageFont.truetype("malgun.ttf", 15)
font_badge = ImageFont.truetype("malgunbd.ttf", 16)

img = Image.new("RGBA", (WIDTH, HEIGHT), BG_COLOR)
draw = ImageDraw.Draw(img)

def draw_card(box, fill, outline, width=2, radius=16):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def draw_badge(x, y, text, bg_color, text_color, font=font_badge):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad_x, pad_y = 12, 6
    box = [x, y, x + tw + pad_x*2, y + th + pad_y*2]
    draw.rounded_rectangle(box, radius=8, fill=bg_color)
    draw.text((x + pad_x, y + pad_y - 2), text, fill=text_color, font=font)
    return box

def draw_curve(p1, p2, color, width=3):
    x1, y1 = p1
    x2, y2 = p2
    cx1 = (x1 + x2) // 2
    cy1 = y1
    cx2 = (x1 + x2) // 2
    cy2 = y2
    steps = 40
    points = []
    for i in range(steps + 1):
        t = i / steps
        x = (1-t)**3 * x1 + 3*(1-t)**2 * t * cx1 + 3*(1-t) * t**2 * cx2 + t**3 * x2
        y = (1-t)**3 * y1 + 3*(1-t)**2 * t * cy1 + 3*(1-t) * t**2 * cy2 + t**3 * y2
        points.append((x, y))
    for i in range(len(points) - 1):
        draw.line([points[i], points[i+1]], fill=color, width=width)

# -------------------------------------------------------------
# 1. TOP HEADER BANNER
# -------------------------------------------------------------
draw.text((WIDTH//2, 50), "👑 골드랩(GOLD LAB) 순금 골드바 & 고금 매입 전문 롤링 시스템", fill=GOLD_BORDER, font=font_title, anchor="mm")
draw.text((WIDTH//2, 105), "주얼리 없이 오직 [순금 골드바 판매 & 고금 매입]만으로 현금 출혈 0원! 회전율로 돈을 쓸어담는 비결", fill=TEXT_MUTED, font=font_subtitle, anchor="mm")

# -------------------------------------------------------------
# 2. CENTRAL ROOT NODE (The Core Trigger)
# -------------------------------------------------------------
rx1, ry1, rx2, ry2 = 100, 360, 620, 600
draw_card([rx1, ry1, rx2, ry2], fill=CARD_BG, outline=GOLD_BORDER, width=3, radius=18)
draw_badge(rx1 + 25, ry1 + 20, "STEP 1. 시작 (고금 매입 입구)", bg_color=(88, 64, 16), text_color=GOLD_BORDER)

draw.text((rx1 + 25, ry1 + 65), "손님이 헌 금(14K/18K/돌반지)\n10돈(약 680만원) 팔러 왔을 때", fill=TEXT_WHITE, font=font_h1)

# Choice A: Red (Bad)
cax1, cay1, cax2, cay2 = rx1 + 25, ry1 + 135, rx2 - 25, ry1 + 185
draw.rounded_rectangle([cax1, cay1, cax2, cay2], radius=8, fill=RED_BG, outline=RED_LOSS, width=1)
draw.text((cax1 + 15, cay1 + 14), "❌ 일반 매장: 현금 680만원 지급 (통장 현금 증발, 손님 이탈)", fill=(254, 205, 211), font=font_body_bold)

# Choice B: Green/Gold (Good)
cbx1, cby1, cbx2, cby2 = rx1 + 25, ry1 + 195, rx2 - 25, ry1 + 250
draw.rounded_rectangle([cbx1, cby1, cbx2, cby2], radius=8, fill=(30, 41, 59), outline=GOLD_ACCENT, width=2)
draw.text((cbx1 + 15, cby1 + 14), "✨ 골드랩 제안: [순금 골드바 다이렉트 맞교환] (돈 묶임!)", fill=GOLD_ACCENT, font=font_body_bold)

start_pt = (rx2, (ry1 + ry2) // 2 + 10)
target_top = (780, 350)
target_bot = (780, 690)
draw_curve(start_pt, target_top, GREEN_PROFIT, width=3)
draw_curve(start_pt, target_bot, BLUE_CYAN, width=3)

# -------------------------------------------------------------
# 3. BRANCH A: 고금 ➔ 24K 골드바 다이렉트 스왑 (The Immediate Cashless Swap)
# -------------------------------------------------------------
bx1, by1, bx2, by2 = 780, 190, 1420, 520
draw_card([bx1, by1, bx2, by2], fill=CARD_BG, outline=GREEN_PROFIT, width=3, radius=18)
draw_badge(bx1 + 25, by1 + 20, "STEP 2-A. 골드바 다이렉트 스왑", bg_color=GREEN_BG, text_color=(167, 243, 208))
draw.text((bx1 + 310, by1 + 23), "★ 현금 출혈 0원 + 정련 마진!", fill=GREEN_PROFIT, font=font_body_bold)

draw.text((bx1 + 25, by1 + 65), "\"현금 대신 999.9 정품 순금 골드바로 바로 바꿔가세요!\"", fill=TEXT_WHITE, font=font_h1)
draw.line([(bx1 + 25, by1 + 108), (bx2 - 25, by1 + 108)], fill=CARD_BORDER, width=1)

draw.text((bx1 + 25, by1 + 125), "• 파격 혜택 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((bx1 + 140, by1 + 125), "골드바 프레스/바큠 케이스 공임비(돈당 1.5만원) 【전액 0원 무료 면제】", fill=GOLD_ACCENT, font=font_body_bold)

draw.text((bx1 + 25, by1 + 165), "• 손님 심리 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((bx1 + 140, by1 + 165), "\"다른 데 가면 수수료 20만원 까이는데 여긴 공짜로 골드바를 주네!\"", fill=TEXT_WHITE, font=font_body)

draw.text((bx1 + 25, by1 + 205), "• 사장 마진 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((bx1 + 140, by1 + 205), "가져온 헌 금 종로 제련소 정련/해리 차익 (돈당 2만원 x 10돈 = 20만원)", fill=TEXT_SUB, font=font_body)

pbox1 = [bx1 + 25, by1 + 245, bx2 - 25, by1 + 305]
draw.rounded_rectangle(pbox1, radius=10, fill=GREEN_BG, outline=GREEN_PROFIT, width=2)
draw.text((pbox1[0] + 20, pbox1[1] + 16), "💰 사장의 결과 : 현금 지출 0원 + 【+20만원 순이익】 + 골드바 재고 소진!", fill=(209, 250, 229), font=font_h2)

# -------------------------------------------------------------
# 4. BRANCH B: 시세차익 매도 시 ➔ 골드랩 장부 예치 롤링 (Lock-In)
# -------------------------------------------------------------
cx1, cy1, cx2, cy2 = 780, 560, 1420, 890
draw_card([cx1, cy1, cx2, cy2], fill=CARD_BG, outline=BLUE_CYAN, width=3, radius=18)
draw_badge(cx1 + 25, cy1 + 20, "STEP 2-B. 골드바 매도 손님 락인", bg_color=(12, 74, 110), text_color=(186, 230, 253))
draw.text((cx1 + 320, cy1 + 23), "★ 자금 유출 방지 (롤링 칩 예치)!", fill=BLUE_CYAN, font=font_body_bold)

draw.text((cx1 + 25, cy1 + 65), "손님이 \"1년 전 산 골드바, 시세 올랐으니 팔게요\" 할 때", fill=TEXT_WHITE, font=font_h1)
draw.line([(cx1 + 25, cy1 + 108), (cx2 - 25, cy1 + 108)], fill=CARD_BORDER, width=1)

draw.text((cx1 + 25, cy1 + 125), "• 대응 전략 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((cx1 + 140, cy1 + 125), "현금 인출 대신 【골드랩 롤링 예치 계좌(골드 칩)】에 보관 유도", fill=GOLD_ACCENT, font=font_body_bold)

draw.text((cx1 + 25, cy1 + 165), "• 제공 혜택 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((cx1 + 140, cy1 + 165), "예치 고객에게 다음번 금값 하락 시 【도매 최저가 재매수권(수수료 0원)】 부여", fill=TEXT_WHITE, font=font_body)

draw.text((cx1 + 25, cy1 + 205), "• 사장 이득 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((cx1 + 140, cy1 + 205), "손님의 수천만원 자금이 은행/타 금은방으로 안 빠져나가고 매장에 영구 묶임", fill=TEXT_SUB, font=font_body)

pbox2 = [cx1 + 25, cy1 + 245, cx2 - 25, cy1 + 305]
draw.rounded_rectangle(pbox2, radius=10, fill=(15, 43, 70), outline=BLUE_CYAN, width=2)
draw.text((pbox2[0] + 20, pbox2[1] + 16), "🔒 사장의 결과 : 자금 이탈 0% + 【평생 단골 락인 & 재구매 회전율 폭발】", fill=(224, 242, 254), font=font_h2)

# -------------------------------------------------------------
# 5. BOTTOM LEFT: 순금/고금 전문점의 3대 안전장치 & 마진 출처
# -------------------------------------------------------------
sx1, sy1, sx2, sy2 = 100, 680, 620, 1270
draw_card([sx1, sy1, sx2, sy2], fill=CARD_BG, outline=CARD_BORDER, width=2, radius=18)
draw_badge(sx1 + 25, sy1 + 20, "SAFETY NET. 순금 전문점 마진 출처", bg_color=(51, 65, 85), text_color=(226, 232, 240))

draw.text((sx1 + 25, sy1 + 65), "주얼리 없이 마진 남기는 4대 무기", fill=TEXT_WHITE, font=font_h1)
draw.line([(sx1 + 25, sy1 + 105), (sx2 - 25, sy1 + 105)], fill=CARD_BORDER, width=1)

bullion_shields = [
    ("🔥 1. 고금 정련/해리 마진 (돈당 1.5만~2.5만원)", 
     "손님 헌 금(14K/18K/치금)을 종로 제련소로 보낼 때\n순도 분리 과정에서 생기는 확실한 원천 마진"),
    ("🏭 2. 종로 정련소 대량 롤링 콤프 (단가 인하)", 
     "롤링으로 한 달 100돈~300돈을 종로 공장에 밀어넣으면\n정련 수수료 50% 할인 + 골드바 출고단가 최저 도매가 확보"),
    ("⚖️ 3. 중량 쪼개기/키우기 프리미엄 마진", 
     "10돈 1개를 ➔ 1돈 10개로 쪼갤 때(개당 1.5만원씩 15만원 공임 확보)\n또는 1돈 여러 개를 ➔ 10돈/100g 덩어리로 뭉쳐줄 때 차익"),
    ("💰 4. 현금 유동성 보존 (돈맥경화 제로)", 
     "스왑(교환)으로 거래하므로 사장님의 현금 자본이 마르지 않고\n적은 자본금으로도 수억원대 대량 거래를 무한 회전 가능")
]

cur_y = sy1 + 120
for s_title, s_desc in bullion_shields:
    draw.text((sx1 + 25, cur_y), s_title, fill=GOLD_BORDER, font=font_body_bold)
    cur_y += 28
    for line in s_desc.split("\n"):
        draw.text((sx1 + 45, cur_y), line, fill=TEXT_SUB, font=font_small)
        cur_y += 22
    cur_y += 18

# -------------------------------------------------------------
# 6. RIGHT SIDE: 외부 에이전트 영업 엔진 (큰손 자산가 유입)
# -------------------------------------------------------------
ax1, ay1, ax2, ay2 = 1500, 190, 2100, 890
draw_card([ax1, ay1, ax2, ay2], fill=CARD_BG, outline=PURPLE_AGENT, width=3, radius=18)
draw_badge(ax1 + 25, ay1 + 20, "STEP 3. 큰손 데려오는 에이전트 엔진", bg_color=(88, 28, 135), text_color=(233, 213, 255))

draw.text((ax1 + 25, ay1 + 65), "억 단위 자산가를 모셔오는 비결", fill=TEXT_WHITE, font=font_h1)
draw.line([(ax1 + 25, ay1 + 105), (ax2 - 25, ay1 + 105)], fill=CARD_BORDER, width=1)

draw.text((ax1 + 25, ay1 + 125), "• 타깃 에이전트 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((ax1 + 25, ay1 + 155), "세무사 사무장, 부동산 대표, 고급차/수입차 딜러", fill=TEXT_WHITE, font=font_body)

draw.text((ax1 + 25, ay1 + 205), "• 골드바 롤링 보상 룰 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((ax1 + 25, ay1 + 235), "소개 고객이 골드바 1억원(약 140~150돈) 매수 시\n【현금 30만원(0.3%) + 1g 미니 골드바(콤프)】 즉시 지급!", fill=PURPLE_AGENT, font=font_body_bold)

draw.text((ax1 + 25, ay1 + 305), "• 에이전트 심리 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((ax1 + 25, ay1 + 335), "\"1g 미니 골드바 모으는 재미도 쏠쏠하고,\n내 VIP 고객에게 정품 골드바 도매가로 연결해주니 생색 최고!\"", fill=TEXT_SUB, font=font_body)

abox = [ax1 + 25, ay1 + 430, ax2 - 25, ay1 + 660]
draw.rounded_rectangle(abox, radius=12, fill=(38, 20, 60), outline=PURPLE_AGENT, width=2)
draw.text((abox[0] + 20, abox[1] + 20), "🚀 사장의 압도적인 손익 계산 :", fill=(243, 232, 255), font=font_h2)
draw.text((abox[0] + 20, abox[1] + 65), "• 골드바 1억원 거래 시 사장 마진: 약 120만~150만원\n• 에이전트에게 30만원+미니골드바 떼줘도\n👉 【앉은자리에서 +80만~110만원 순수익 확보!】\n• 사장이 발로 안 뛰어도 큰손 고객 독점 유치!", fill=TEXT_WHITE, font=font_body)

draw_curve((bx2, 350), (ax1, 350), PURPLE_AGENT, width=2)
draw_curve((cx2, 690), (ax1, 690), PURPLE_AGENT, width=2)

# -------------------------------------------------------------
# 7. BOTTOM FULL-WIDTH SUMMARY BANNER
# -------------------------------------------------------------
sum_x1, sum_y1, sum_x2, sum_y2 = 780, 940, 2100, 1270
draw_card([sum_x1, sum_y1, sum_x2, sum_y2], fill=(15, 23, 42), outline=GOLD_BORDER, width=2, radius=18)

draw_badge(sum_x1 + 30, sum_y1 + 25, "FINAL SUMMARY. 순금 골드바 전문점 롤링 핵심 요약", bg_color=(88, 64, 16), text_color=GOLD_BORDER)
draw.text((sum_x1 + 30, sum_y1 + 75), "현금 출혈 없이 고금을 순금 골드바로 맞교환(스왑)하여 정련 마진을 챙기고 회전율로 승부한다!", fill=TEXT_WHITE, font=font_h1)

bullion_steps = [
    ("1. 스왑 가두기 (현금 유출 0원)", "고금 팔러 온 손님에게 공임비 무료 골드바로 맞교환시켜 매장 현금 유출을 원천 차단."),
    ("2. 정련 마진화 (돈당 2만원 확보)", "확보한 헌 금을 종로 정련소에 넘겨 10돈당 20만원의 확실한 제련 차익을 챙긴다."),
    ("3. 골드바 락인 (재매수 자금 고정)", "골드바 팔러 온 손님에게 롤링 예치 칩을 줘서 재매수 자금이 다른 데로 안 새게 묶는다."),
    ("4. 에이전트 콤프 (억 단위 큰손 유치)", "세무사·부동산에 미니 골드바 콤프를 줘서 억 단위 골드바 매수 고객을 자동으로 몰고 온다.")
]

s_col1_x = sum_x1 + 30
s_col2_x = sum_x1 + 680
for idx, (stitle, sdesc) in enumerate(bullion_steps):
    px = s_col1_x if idx < 2 else s_col2_x
    py = sum_y1 + 130 + (idx % 2) * 85
    draw.text((px, py), stitle, fill=GOLD_ACCENT, font=font_body_bold)
    draw.text((px, py + 26), sdesc, fill=TEXT_SUB, font=font_small)

# -------------------------------------------------------------
# 8. SAVE IMAGE
# -------------------------------------------------------------
BASE_DIR = r"c:\Users\WD\Desktop\작업용\ju\골드랩 작업"
out_workspace = os.path.join(BASE_DIR, "골드랩_롤링비즈니스_마인드맵.png")
img.save(out_workspace, "PNG")

import shutil
downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
out_downloads = os.path.join(downloads_dir, "골드랩_롤링비즈니스_마인드맵.png")
try:
    shutil.copyfile(out_workspace, out_downloads)
except Exception as e:
    print(f"Downloads copy note: {e}")

print(f"Bullion Mindmap updated successfully:")
print(f"1. {out_workspace}")
print(f"2. {out_downloads}")
