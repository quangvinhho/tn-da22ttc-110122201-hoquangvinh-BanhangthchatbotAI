import re

with open('frontend/admin-login.html', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('Đăng nhập Admin', 'Đăng nhập Nhân viên')
c = c.replace('admin_bg.png', 'store_bg.png')
c = c.replace('from-blue-500 to-indigo-600', 'from-emerald-500 to-teal-600')
c = c.replace('text-blue-', 'text-emerald-')
c = c.replace('bg-blue-', 'bg-emerald-')
c = c.replace('border-blue-', 'border-emerald-')
c = c.replace('shadow-blue-', 'shadow-emerald-')
c = c.replace('from-blue-600 to-indigo-600', 'from-emerald-600 to-teal-600')
c = c.replace('hover:from-blue-700 hover:to-indigo-700', 'hover:from-emerald-700 hover:to-teal-700')
c = c.replace('Khu vực quản trị', 'Cổng nhân viên')
c = c.replace('Hệ thống quản trị trung tâm', 'Hệ thống quản lý bán hàng')
c = c.replace('Nhập tài khoản admin', 'Nhập tài khoản nhân viên')
c = c.replace('/api/auth/admin/login', '/api/auth/employee/login')

# Remove Google login
c = re.sub(r'<button type="button" onclick="loginWithGoogle\(\)".*?</button>', '', c, flags=re.DOTALL)
c = re.sub(r'<div class="flex items-center my-8">.*?</div>', '', c, flags=re.DOTALL)

with open('frontend/employee-login.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("Created frontend/employee-login.html successfully")
