
CREATE TABLE Laureates
(
  id INT NOT NULL
    CONSTRAINT PK_Laureate_id PRIMARY KEY,
  firstName NVARCHAR(60) NOT NULL,
  surname NVARCHAR(60) NOT NULL,
  born DATE NOT NULL,
  died DATE,
  bornCountry NVARCHAR(60) NOT NULL,
  bornCity NVARCHAR(60) NOT NULL,
  diedCountry NVARCHAR(60),
  diedCountryCode CHAR(2),
  diedCity NVARCHAR(60) NOT NULL,
  gender NVARCHAR(7) NOT NULL
    CONSTRAINT CK_Laureate_gender CHECK (gender = 'male' OR gender = 'female')
)
