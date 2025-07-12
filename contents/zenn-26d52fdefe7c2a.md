---
title: "🌀 処理時間が長いAPIをリクエストしたときのローディングUIについて"
emoji: "🌀"
type: "tech"
topics: ["React", "Next.js", "ローディングUI", "UX"]
published: true
created_at: "2024-03-31T00:00:00.000Z"
published_at: "2024-03-31T00:00:00.000Z"
---

# 処理時間が長いAPIをリクエストしたときのローディングUIについて

## 📌 作ろうと思った背景

生成AIのエージェントAPIを利用する際、レスポンス時間が非常に長いことがきっかけでした。オーケストレーションレイヤーでの複雑な処理により、APIのレスポンスが遅くなることがあります。

現代の開発では、ユーザーエクスペリエンス（UX）の向上が重要です。単に機能が豊富であるだけでなく、ユーザーが快適に利用できることが求められています。

ChatGPTのDALL-Eの画像生成プロセスは、優れたローディングUIの良い例です。処理に時間がかかっても、進行状況が明確に示されるため、ユーザーは安心して待つことができます。

## 📌 コードについて

### 準備

- 使用技術:
  - Next.js (14.0.0)
  - React (18.2.0)
  - TailwindCSS

### Streamの値からステータスを読み取るローディングUI

#### 実装のポイント

- SVGを使用したカスタムローディングスピナー
- ステータスに応じて変化する円形プログレスバー
- ステータスラベルの表示

```typescript
// APIレスポンスのストリーミング例
async function* makeIterator() {
  await sleep(1000)
  yield encoder.encode('{"text":"called"}')
  await sleep(3000)
  yield encoder.encode('{"text":"running"}')
  await sleep(3000)
  yield encoder.encode('{"text":"finished"}')
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

#### ローディングUIコンポーネント

```tsx
import React, { useState, useEffect } from 'react';

interface LoadingProps {
  status: 'idle' | 'called' | 'running' | 'finished';
  progress?: number;
}

const CircularProgress: React.FC<LoadingProps> = ({ status, progress = 0 }) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  
  // ステータスに応じた進行率
  const statusProgress = {
    idle: 0,
    called: 25,
    running: 50,
    finished: 100
  };

  useEffect(() => {
    const targetProgress = progress || statusProgress[status];
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        if (prev < targetProgress) {
          return Math.min(prev + 2, targetProgress);
        }
        return prev;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [status, progress]);

  const radius = 45;
  const strokeWidth = 8;
  const normalizedRadius = radius - strokeWidth * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (displayProgress / 100) * circumference;

  const statusLabels = {
    idle: '待機中',
    called: 'API呼び出し中',
    running: '処理実行中',
    finished: '完了'
  };

  const statusColors = {
    idle: 'text-gray-500',
    called: 'text-blue-500',
    running: 'text-yellow-500',
    finished: 'text-green-500'
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="relative">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="transform -rotate-90"
        >
          {/* 背景の円 */}
          <circle
            stroke="currentColor"
            className="text-gray-200"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* 進行状況を示す円 */}
          <circle
            stroke="currentColor"
            className={`transition-all duration-500 ${
              status === 'finished' ? 'text-green-500' : 'text-blue-500'
            }`}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        
        {/* 中央のパーセンテージ表示 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-gray-700">
            {Math.round(displayProgress)}%
          </span>
        </div>
      </div>
      
      {/* ステータスラベル */}
      <div className={`text-sm font-medium ${statusColors[status]}`}>
        {statusLabels[status]}
      </div>
      
      {/* ローディングアニメーション */}
      {status !== 'finished' && status !== 'idle' && (
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      )}
    </div>
  );
};
```

### ストリーミングAPIとの連携

```tsx
const LoadingDemo: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'called' | 'running' | 'finished'>('idle');
  const [isLoading, setIsLoading] = useState(false);

  const handleApiCall = async () => {
    setIsLoading(true);
    setStatus('idle');

    try {
      const response = await fetch('/api/stream-status');
      const reader = response.body?.getReader();
      
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        try {
          const data = JSON.parse(chunk);
          setStatus(data.text);
        } catch (e) {
          // JSONパースエラーのハンドリング
          console.warn('Failed to parse chunk:', chunk);
        }
      }
    } catch (error) {
      console.error('API call failed:', error);
      setStatus('idle');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-bold text-center mb-6">
        API処理状況
      </h2>
      
      <CircularProgress status={status} />
      
      <div className="mt-6 space-y-2">
        <button
          onClick={handleApiCall}
          disabled={isLoading}
          className="w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? '処理中...' : 'API実行'}
        </button>
        
        {status === 'finished' && (
          <div className="p-3 bg-green-100 text-green-700 rounded-lg text-center">
            処理が正常に完了しました！
          </div>
        )}
      </div>
    </div>
  );
};
```

### Route Handler（API側）の実装

```typescript
// app/api/stream-status/route.ts
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ステップ1: API呼び出し開始
        await sleep(1000);
        controller.enqueue(encoder.encode('{"text":"called"}\n'));
        
        // ステップ2: 処理実行中
        await sleep(3000);
        controller.enqueue(encoder.encode('{"text":"running"}\n'));
        
        // ステップ3: 処理完了
        await sleep(3000);
        controller.enqueue(encoder.encode('{"text":"finished"}\n'));
        
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## 📌 UXの改善ポイント

### 1. 進行状況の可視化

- **進行率の表示**: ユーザーがどの程度完了したかを把握できる
- **ステータスラベル**: 現在何が行われているかを明確に示す
- **視覚的フィードバック**: 色やアニメーションで状態を表現

### 2. 予想される待機時間の表示

```tsx
const estimatedTimes = {
  called: '約30秒',
  running: '約2分',
  finished: '完了'
};

// コンポーネント内で使用
<div className="text-xs text-gray-500 mt-2">
  予想時間: {estimatedTimes[status]}
</div>
```

### 3. キャンセル機能の実装

```tsx
const [abortController, setAbortController] = useState<AbortController | null>(null);

const handleCancel = () => {
  if (abortController) {
    abortController.abort();
    setStatus('idle');
    setIsLoading(false);
  }
};

// APIコール時
const controller = new AbortController();
setAbortController(controller);

const response = await fetch('/api/stream-status', {
  signal: controller.signal
});
```

### 4. エラーハンドリング

```tsx
const [error, setError] = useState<string | null>(null);

// エラー状態の表示
{error && (
  <div className="p-3 bg-red-100 text-red-700 rounded-lg text-center">
    エラー: {error}
  </div>
)}
```

## 📝 まとめ

長時間のAPI処理において、適切なローディングUIを実装することで：

✅ **ユーザーの不安を軽減**: 進行状況が分かることで安心感を提供
✅ **離脱率の改善**: 待機時間中のユーザー体験向上
✅ **透明性の向上**: 処理の各段階を明確に表示
✅ **エラー対応**: 問題発生時の適切なフィードバック

特に生成AIやデータ処理系のAPIでは、処理時間が予測しにくいため、こうしたローディングUIの重要性がより高まります。

ストリーミングレスポンスと組み合わせることで、リアルタイムに状況を更新でき、より良いユーザー体験を提供できます。