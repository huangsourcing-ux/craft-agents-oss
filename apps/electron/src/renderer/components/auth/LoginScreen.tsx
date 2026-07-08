import { useState } from 'react'
import { LockKeyhole, UserRound } from 'lucide-react'
import { Spinner } from '@craft-agent/ui'
import { CraftAgentsSymbol } from '@/components/icons/CraftAgentsSymbol'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EmployeeLoginCredentials } from '@/lib/auth-client'
import { EmployeeAuthError } from '@/lib/auth-client'

interface LoginScreenProps {
  onLogin: (credentials: EmployeeLoginCredentials) => Promise<void>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof EmployeeAuthError) {
    if (error.status === 429) return '登录尝试过多，请稍后再试。'
    if (error.status === 401) return '账号或密码不正确。'
    return error.message
  }
  if (error instanceof Error) return error.message
  return '暂时无法登录，请检查网络后重试。'
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = username.trim().length > 0 && password.length > 0 && !isSubmitting

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setError(null)

    try {
      await onLogin({ username: username.trim(), password })
    } catch (err) {
      setError(getErrorMessage(err))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-foreground-2">
      <div className="titlebar-drag-region fixed top-0 left-0 right-0 h-[50px] z-titlebar" />

      <main className="flex flex-1 items-center justify-center p-5 sm:p-8">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[30rem] flex-col items-center rounded-lg border border-foreground/10 bg-background/90 px-7 py-8 shadow-modal-small backdrop-blur sm:px-9 sm:py-9"
        >
          <div className="mb-7 flex flex-col items-center">
            <CraftAgentsSymbol className="h-28 w-28 object-contain" />
            <div className="mt-4 text-sm font-medium text-muted-foreground">WudiBuddy Agents</div>
          </div>

          <div className="text-center">
            {/* [FORK] Company login copy avoids model/API account onboarding language. */}
            <h1 className="text-xl font-semibold">登录企业工作台</h1>
            <p className="mt-3 max-w-[24rem] text-sm leading-6 text-muted-foreground">
              请使用公司统一分配的账号完成身份验证。登录后将进入 WudiBuddy Agents 企业工作台。
            </p>
          </div>

          <div className="mt-7 w-full space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">企业账号</span>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="请输入企业账号"
                  className="h-11 pl-9"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">登录密码</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="请输入登录密码"
                  className="h-11 pl-9"
                  disabled={isSubmitting}
                />
              </div>
            </label>

            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="mt-7 h-11 w-full rounded-lg shadow-minimal"
          >
            {isSubmitting ? (
              <>
                <Spinner className="mr-2" />
                正在验证...
              </>
            ) : (
              '登录 WudiBuddy Agents'
            )}
          </Button>

          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
            仅限授权员工使用。如无法登录，请联系系统管理员核验账号状态。
          </p>
        </form>
      </main>
    </div>
  )
}
