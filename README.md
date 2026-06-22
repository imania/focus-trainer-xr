# Focus Trainer XR

Meta Quest 2에서 사용할 수 있는 눈 초점 전환/추적 운동용 WebXR MVP입니다.

## 기능

- 왼쪽 눈, 오른쪽 눈, 양쪽 눈, 좌우 교대 운동 선택
- 가까이-멀리 초점 전환, 좌우 추적, 상하 추적, 원형 추적 패턴
- 1-10분 세션 타이머
- 반복 횟수와 현재 운동 눈 표시
- 일반 브라우저 3D 미리보기 및 Quest Browser WebXR 진입

## 실행

정적 파일 서버가 있으면 이 폴더를 서비스하면 됩니다.

```powershell
python serve.py
```

또는 기본 정적 서버로도 미리보기가 가능합니다.

```powershell
python -m http.server 8080
```

Node 런타임을 선호하면 다음 스크립트도 사용할 수 있습니다.

```powershell
node server.js
```

PC 브라우저에서는 `http://localhost:8080`으로 미리보기를 확인할 수 있습니다.

Quest 2의 몰입형 WebXR은 보통 HTTPS 보안 컨텍스트가 필요합니다. 실제 헤드셋 테스트는 다음 중 하나를 권장합니다.

- GitHub Pages, Cloudflare Pages, Netlify 같은 HTTPS 정적 호스팅에 배포
- Cloudflare Tunnel 또는 ngrok으로 로컬 서버를 HTTPS 주소로 노출
- 이후 Unity/OpenXR APK로 포팅하여 Quest에 사이드로드

Quest Browser에서 HTTPS 주소로 접속한 뒤 `Enter VR`을 누르면 됩니다.

## 개발 메모

Quest 2는 눈 추적 센서가 없으므로 사용자가 실제로 어느 눈을 움직였는지 측정하지 않습니다. 대신 왼쪽/오른쪽 렌더 패스를 나누어 선택한 눈에는 선명한 타겟을, 반대쪽 눈에는 낮은 대비의 가이드만 보여줍니다.

## 안전 고지

이 앱은 의료 진단, 치료, 시력 교정 효과를 보장하지 않습니다. 통증, 두통, 복시, 어지러움,
구역감이 발생하면 즉시 중단하고 필요하면 안과 전문의와 상담하세요.
