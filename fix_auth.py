import re

# Fix 1: Auth.tsx - mock sign-in uses window.location.replace instead of navigate
with open('src/screens/Auth.tsx', 'r') as f:
    content = f.read()

# Replace navigate('/') with window.location.replace('/') in handleMockSignIn
# Also replace navigate('/onboarding') with window.location.replace('/onboarding')
content = content.replace(
    "navigate('/');\n        setLoading(false);\n        return;\n      } else {\n        navigate('/onboarding');\n        setLoading(false);\n        return;\n      }",
    "window.location.replace('/');\n        setLoading(false);\n        return;\n      } else {\n        window.location.replace('/onboarding');\n        setLoading(false);\n        return;\n      }"
)

with open('src/screens/Auth.tsx', 'w') as f:
    f.write(content)

print('Auth.tsx fixed')

# Fix 2: Onboarding/index.tsx - handleContinueS4 uses window.location.replace
with open('src/screens/Onboarding/index.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "navigate('/');\n  }",
    "window.location.replace('/');\n  }"
)

with open('src/screens/Onboarding/index.tsx', 'w') as f:
    f.write(content)

print('Onboarding/index.tsx fixed')
