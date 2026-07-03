import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const updateIsMobile = () => {
      setIsMobile(mql.matches)
    }

    mql.addEventListener('change', updateIsMobile)
    updateIsMobile()

    return () => {
      mql.removeEventListener('change', updateIsMobile)
    }
  }, [])

  return !!isMobile
}
