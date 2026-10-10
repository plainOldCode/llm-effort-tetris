# 원본 프롬프트 (verbatim)

```
tetris game 을 html 로 구성하고 react 를 이용하고 typescript 를 사용해라.
```

## 실행 조건 (3조건 공통)

- 모델: 자체 호스팅 오픈웨이트 원모델 (서빙 alias `dgx-local`) — 단발 호출, 스트리밍
- 세션: 조건마다 **새 세션** (컨텍스트 공유 없음)
- 시드/온도 등 나머지 파라미터: 기본값
- `max_tokens = 131072`
- 프롬프트는 위 원문 그대로 (조건 간 유일한 차이는 reasoning effort뿐)

## 산출물 처리

- 응답은 단일 HTML 코드펜스로 반환됨 (babel standalone TS 프리셋, React 18 UMD)
- 추출: HTML 펜스 내 babel 스크립트 블록 → `src/main.tsx`로 분리, Vite+React+TS 프로젝트로 구성 (`implementations/`)
- 객관 검증: `tsc --noEmit` + `vite build` (`evidence/`)

## 상한 파일럿 (이 값 결정 경위)

| max_tokens | 결과 |
| --- | --- |
| 8,000 | high·max가 추론 토큰 소진으로 **빈 응답(0자)** |
| 32,768 | low truncated (32K 도달) |
| **131,072** | **본선 확정** — 3조건 모두 완결 |

파일럿 실측: `results/metrics_pilot_cap32k.json`
