# 七変化！ポーズ道場 3D

添付された7枚の写真を題材にした、30秒のブラウザ反射神経ゲームです。写真のポーズを「直立・翼・背面・突撃」の4つに見切って回答します。途中から「ひとつ前を答える記憶指令」と「写真以外を答える逆指令」が出現します。

## 起動

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開いてください。スマートフォンのタップ操作と、PCの数字キー `1`〜`4` に対応しています。

## Blenderアセット

- 編集可能モデル: `models/pose-dojo.blend`
- 自動生成スクリプト: `blender/build_assets.py`
- ゲーム用レンダー: `assets/renders/`

人物、衣装、4ポーズ、ネオン舞台、小物、ライティングはBlender 5.2でモデリング・レンダリングしています。再生成する場合:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/build_assets.py
```

## 画像生成アセット

元写真の人物・衣装・ポーズ・部屋を参照し、タイトル用キービジュアル、人物なしの対戦ステージ、必殺技カットを生成しています。ゲーム中は元写真7枚を連写する実写ストップモーションと、Blenderで制作した4ポーズの3D変身アニメーションを重ねています。
