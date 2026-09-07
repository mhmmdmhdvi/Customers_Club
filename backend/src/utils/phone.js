function isValidIranianPhone(phone) {
    return /^09\d{9}$/.test(phone);
}

module.exports={
    isValidIranianPhone,
}