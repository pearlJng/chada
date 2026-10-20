# CHADA — 디자인 가이드

> 기획 기준은 `CLAUDE.md`가 우선한다.

## Overview

비주얼 메타포는 **"깜깜한 동네에 불이 하나씩 켜진다"**. 중심 그래픽은 **무광 클레이 아이소메트릭 미니어처 "손바닥 위의 동네"**. 사진 대신 이 그래픽이 브랜드의 얼굴이다. 페이지는 밤 → 새벽 → 아침으로 밝아진다.

## Colors

키컬러는 시안 1개. 식당 불빛은 별도 컬러가 아니라 이미지 속 따뜻한 빛과 오프화이트 글로우로 처리한다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--night` | `#07111F` | 기본 배경 (새벽 네이비) |
| `--night-2` | `#0E1A2B` | 카드·교차 섹션 |
| `--dawn` | `#20406A` | 4번 섹션 끝, 새벽 하늘 |
| `--paper` | `#F4F2EC` | 텍스트, 오프화이트 |
| `--muted` | `#A6B1C2` | 보조 텍스트 |
| `--cold` | `#5CE1E6` | **유일한 포인트** — 경로, 온도, CTA, 칩 |

- 시안 위 텍스트는 `--night`
- 시안은 냉장 요소(박스 뚜껑, 탑차 문, 경로, 온도)와 CTA에만

## Typography

| 역할 | 서체 | 크기 |
|---|---|---|
| Hero | Pretendard 700 | clamp(34px, 3.6vw, 54px) |
| Section title | Pretendard 700 | clamp(32px, 3.6vw, 52px), 모든 섹션 동일 |
| Body | Pretendard 400 | 17px (MO 16px), line-height 1.7 |
| 숫자(시간·온도) | IBM Plex Mono 500 | 운행 기록 느낌 |

## Layout

- 컨테이너 최대 1280px, 좌우 패딩 `clamp(20px, 5vw, 64px)`
- 섹션 상하여백 `--section-y: clamp(96px, 10vw, 140px)` (MO 80px), 토큰 하나로 통일

## 클레이 그래픽 스타일 규칙

- 시점 통일: 아이소메트릭 약 30°. 예외는 히어로의 1인칭 실내 컷
- 질감: 무광, 둥근 모서리, 손으로 누른 듯한 결. 광택·금속 금지
- 빛: 광원 좌상단 하나, 그림자 하나
- 이미지 안에 글자 없음. 라벨·시간·온도는 HTML로 얹기
- UI(카드·폼)는 플랫하게, 그림자는 클레이 그림자 방향에 맞춘 토큰 하나

### GPT 고정 스타일 블록 (아이소메트릭)

```
Style: matte clay miniature, handmade claymation look, soft rounded edges, subtle hand-pressed texture, no gloss, no reflections, no plastic or metal shine. Isometric view at about 30 degrees, orthographic, no perspective distortion. One soft light source from the top left, one soft diffused shadow. Muted low-saturation palette: off-white (#F4F2EC), warm gray, deep muted navy (#0E1A2B). The only bright accent color is icy cyan (#5CE1E6), used ONLY on refrigerated elements. No text, no letters, no logos, no signage writing anywhere. No human faces. Clean, calm, premium, tactile.
```

## 에셋 (`asset/`)

| 파일 | 내용 | 쓰는 곳 |
|---|---|---|
| `hero-room.webp` | 가게 안, 문틀 부분 투명 | 히어로, 9번 |
| `hero-door.webp` | 문짝 (CSS rotateY로 열림) | 히어로, 9번 |
| `hero-outside.webp` | 문밖 새벽 골목 | 히어로 |
| `hero-box.webp` | 냉장 박스 | 히어로 |
| `town-night.webp` / `town-lit.webp` | 동네 디오라마 불 꺼짐/켜짐, 배경 투명, 위치 오차 0px | 4번 |
| `truck-front.webp` / `truck-rear.webp` | 탑차 앞/뒤, 좌우 반전으로 4방향 | 3·4번 |

히어로 좌표계: 실내 이미지 1672×941 기준, 문틀 구멍 `x 648 / y 87 / w 378 / h 658`.
디오라마 좌표계: 1671×941 기준. 경로·식당 좌표는 `script.js`의 `ROUTE` 참고.

## Motion

- 히어로: ① 문 쪽으로 걸어감 ② 문이 안쪽으로 열림 ③ 박스 내려앉음 → 헤드라인. 문 열리기 전에는 텍스트 없음, 닫힌 문 틈으로 어스름한 빛. 히어로 구간에서는 헤더 배경(딤) 없음. PC는 문손잡이 hover 시 들썩, 클릭 시 열림
- 4번: 스크롤에 따라 경로 드로잉, 트럭 이동(방향에 따라 앞/뒤·반전), 지나간 식당 불 켜짐, 시계 03:30→05:40, 끝에 배경 새벽빛
- 그 외 섹션: 1회 리빌만. 과한 진입 모션 금지
- `prefers-reduced-motion`: 완료 상태로 즉시 표시

## Don'ts

- 금액 표기, 상담 문의 외 버튼, 히어로 버튼, 푸터 약관
- 광택 3D, 지구본·화살표 물류 클리셰, 악수 사진
- 이미지 안 텍스트
