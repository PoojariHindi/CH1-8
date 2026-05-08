Bollywood Vocabulary v2 policy:
importance 4 = Bollywood核心語彙・詩的表現・感情語・文化的に特徴的な語。
importance 3 = 有用な一般詩語・情景語・テーマ語。
importance 2 = 一般文学語彙・高頻度汎用語（例：रात, दुनिया, पल, रास्ता）。
hard stopwords は quiz候補から除外する（例：फिर, कुछ, कहीं, पार, रोज़）。
Bollywood quiz vocab では rare-word重視を維持しつつ、教育価値と Bollywoodらしさを優先する。
display は学習用canonical表記、word は corpus原形保持、normalized は比較・merge用、variants は表記揺れ保持に使用する。


# Bollywood Vocabulary v2 Policy

## Core Philosophy

Bollywood quiz vocab prioritizes:

- Bollywoodらしさ
- 詩的表現
- 感情語
- 文化語彙
- rare-word learning value

単なる高頻度一般語は優先しない。

---

# Importance Levels

## importance 4

Bollywood核心語彙・詩的表現・感情語・文化的に特徴的な語。

Examples:

- फ़ना
- तमन्ना
- जूनून
- रूह
- देवर
- रब्बा

---

## importance 3

有用な一般詩語・情景語・テーマ語。

Examples:

- बरसात
- महक
- याद
- मिठाई
- खटाई

---

## importance 2

一般文学語彙・高頻度汎用語だが、教育価値は残る語。

Examples:

- साया
- चमन
- पवन

importance 2 は「低価値」ではなく、
「一般語寄りだが学習価値あり」を意味する。

---

# Stopword Tiers

## Tier A: hardStopwords

完全除外。

Examples:

- फिर
- कुछ
- कोई
- जाना
- कहना
- बहुत

これらは quiz 候補にしない。

---

## Tier B: softStopwords

原則除外。

Examples:

- दूर
- रात
- दुनिया
- पार
- रोज़
- पुराना
- पल
- रास्ता
- याद

Bollywoodらしさ・文化性・教育価値が高い場合のみ manual review 対象。

---

# Canonical Display Policy

## word

Corpus原形保持。

## display

学習用 canonical 表記。
Quiz 表示に優先使用。

## normalized

比較・merge用。

## variants

表記揺れ保持用。

Example:

```json
{
  "word": "आसमाँ",
  "normalized": "आसमान",
  "display": "आसमान",
  "variants": ["आसमां"]
}